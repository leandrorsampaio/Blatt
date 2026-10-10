/* ================================================================
 *  Blatt server -- platform-neutral core
 *
 *  Serves cv.html behind a Google sign-in for exactly one allowed
 *  account, and stores that person's Blatt data (one JSON document)
 *  so it follows them across devices.
 *
 *  Only Web-standard APIs (Request/Response, fetch, WebCrypto), no
 *  dependencies: the same code runs on Cloudflare Workers, Node 20+,
 *  Deno and Bun. A platform adapter supplies two things -- storage
 *  and the cv.html text -- see cloudflare/worker.mjs and node/server.mjs.
 *
 *  Storage contract (one record, compare-and-swap on `rev`):
 *    get()               -> { rev, updatedAt, data } | null   (data = JSON text)
 *    put(baseRev, rec)   -> true if the stored rev was baseRev (0 = none yet)
 * ================================================================ */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const SESSION_COOKIE = 'blatt_session';
const LOGIN_COOKIE = 'blatt_login';
const SESSION_SECONDS = 30 * 24 * 3600;
const LOGIN_SECONDS = 10 * 60;
const REQUIRED_ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'ALLOWED_EMAIL', 'SESSION_SECRET'];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/* ── Encoding + crypto helpers ─────────────────────────────────── */

function b64urlEncode(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomToken() {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

/* Signed (not encrypted) cookie values: base64url(JSON) + "." + HMAC-SHA256.
   `typ` keeps a login cookie from ever being accepted as a session. */
async function signValue(key, payload) {
  const body = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return body + '.' + b64urlEncode(sig);
}

async function verifyValue(key, value, typ, nowMs) {
  if (!value || value.indexOf('.') < 0) return null;
  const [body, sig] = value.split('.');
  let ok = false;
  try { ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), encoder.encode(body)); } catch { return null; }
  if (!ok) return null;
  let payload;
  try { payload = JSON.parse(decoder.decode(b64urlDecode(body))); } catch { return null; }
  if (!payload || payload.typ !== typ || typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs) return null;
  return payload;
}

function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Responses ─────────────────────────────────────────────────── */

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer', /* the OAuth callback URL carries a one-time code */
};

function respond(body, status, headers) {
  return new Response(body, { status, headers: { ...BASE_HEADERS, ...headers } });
}

function json(obj, status = 200) {
  return respond(JSON.stringify(obj), status, { 'Content-Type': 'application/json; charset=utf-8' });
}

function redirect(location, cookies = []) {
  const res = respond(null, 302, { Location: location });
  for (const c of cookies) res.headers.append('Set-Cookie', c);
  return res;
}

/* Small standalone page for sign-in messages (the app itself is cv.html). */
function page(title, message, link, status = 200, cookies = []) {
  const html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>' + escapeHtml(title) + ' – Blatt</title>' +
    '<style>body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f5f5f5;color:#222;display:flex;' +
    'align-items:center;justify-content:center;min-height:100vh;margin:0}main{background:#fff;padding:36px 40px;border-radius:12px;' +
    'box-shadow:0 2px 16px rgba(0,0,0,.08);max-width:420px}h1{font-size:20px;margin:0 0 10px;color:#2c3e6b}p{line-height:1.5;margin:0 0 20px}' +
    'a{display:inline-block;background:#2c3e6b;color:#fff;text-decoration:none;padding:9px 20px;border-radius:8px;font-weight:600}</style>' +
    '</head><body><main><h1>' + escapeHtml(title) + '</h1><p>' + message + '</p>' +
    (link ? '<a href="' + escapeHtml(link.href) + '">' + escapeHtml(link.label) + '</a>' : '') +
    '</main></body></html>';
  const res = respond(html, status, { 'Content-Type': 'text/html; charset=utf-8' });
  for (const c of cookies) res.headers.append('Set-Cookie', c);
  return res;
}

/* ── Handler ───────────────────────────────────────────────────── */

/**
 * @param {object}   opts
 * @param {object}   opts.env           GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ALLOWED_EMAIL, SESSION_SECRET, PUBLIC_URL (optional)
 * @param {object}   opts.storage       see the storage contract above
 * @param {Function} opts.getAppHtml    () => cv.html text (sync or async)
 * @param {number}  [opts.maxBodyBytes] largest accepted upload (the stored document)
 * @param {Function}[opts.fetch]        injectable for tests
 * @param {Function}[opts.now]          injectable clock for tests (ms)
 */
export function createHandler(opts) {
  const env = opts.env || {};
  const storage = opts.storage;
  const fetchImpl = opts.fetch || ((...args) => fetch(...args));
  const now = opts.now || (() => Date.now());
  const maxBodyBytes = opts.maxBodyBytes || 5_000_000;

  const missing = REQUIRED_ENV.filter((k) => !env[k] || !String(env[k]).trim());
  if (env.SESSION_SECRET && String(env.SESSION_SECRET).length < 32) missing.push('SESSION_SECRET (must be at least 32 characters)');
  const allowedEmail = String(env.ALLOWED_EMAIL || '').trim().toLowerCase();

  let keyPromise = null;
  const hmacKey = () => keyPromise || (keyPromise = crypto.subtle.importKey(
    'raw', encoder.encode(String(env.SESSION_SECRET)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));

  return async function handle(request) {
    const url = new URL(request.url);
    const base = new URL((env.PUBLIC_URL || url.origin).replace(/\/+$/, '') + '/');
    const basePath = base.pathname.replace(/\/$/, '');
    let path = url.pathname;
    if (basePath && (path === basePath || path.startsWith(basePath + '/'))) path = path.slice(basePath.length) || '/';
    const method = request.method;

    if (path === '/healthz') return respond('ok', 200, { 'Content-Type': 'text/plain' });

    if (missing.length) {
      return page('Blatt server is not configured',
        'Set these settings (environment variables / secrets) and restart: <b>' +
        missing.map(escapeHtml).join(', ') + '</b>. See src/server/README.md.', null, 500);
    }

    /* Cookies are Secure on HTTPS; plain http is only workable on localhost. */
    const secure = base.protocol === 'https:';
    const cookiePath = basePath || '/';
    const cookie = (name, value, maxAge) => name + '=' + value + '; Path=' + cookiePath +
      '; Max-Age=' + maxAge + '; HttpOnly; SameSite=Lax' + (secure ? '; Secure' : '');
    const at = (p) => new URL(p.replace(/^\//, ''), base).toString();
    const cookies = parseCookies(request.headers.get('Cookie'));
    const session = await verifyValue(await hmacKey(), cookies[SESSION_COOKIE], 'session', now());
    const signedIn = !!(session && session.email === allowedEmail);

    /* ── Sign-in ── */
    if (path === '/auth/login' && method === 'GET') {
      const state = randomToken();
      const verifier = randomToken();
      const login = await signValue(await hmacKey(), { typ: 'login', state, verifier, exp: Math.floor(now() / 1000) + LOGIN_SECONDS });
      const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: at('/auth/callback'),
        response_type: 'code',
        scope: 'openid email',
        state,
        code_challenge: b64urlEncode(await sha256(verifier)),
        code_challenge_method: 'S256',
        prompt: 'select_account',
        login_hint: allowedEmail,
      });
      return redirect(GOOGLE_AUTH_URL + '?' + params, [cookie(LOGIN_COOKIE, login, LOGIN_SECONDS)]);
    }

    if (path === '/auth/callback' && method === 'GET') {
      const retry = { href: at('/auth/login'), label: 'Try again' };
      const clearLogin = cookie(LOGIN_COOKIE, '', 0);
      if (url.searchParams.get('error')) return page('Sign-in cancelled', 'Google sign-in did not complete.', retry, 400, [clearLogin]);
      const login = await verifyValue(await hmacKey(), cookies[LOGIN_COOKIE], 'login', now());
      if (!login || !url.searchParams.get('code') || url.searchParams.get('state') !== login.state) {
        return page('Sign-in expired', 'That sign-in link is no longer valid. Please start again.', retry, 400, [clearLogin]);
      }

      let claims = null;
      try {
        const tokenRes = await fetchImpl(GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: url.searchParams.get('code'),
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: at('/auth/callback'),
            grant_type: 'authorization_code',
            code_verifier: login.verifier,
          }).toString(),
        });
        const tokens = await tokenRes.json();
        /* The ID token comes straight from Google's token endpoint over TLS, so
           its claims are trusted without a signature check (OIDC Core 3.1.3.7). */
        if (tokenRes.ok && tokens.id_token) claims = JSON.parse(decoder.decode(b64urlDecode(tokens.id_token.split('.')[1])));
      } catch { claims = null; }

      const aud = claims && (Array.isArray(claims.aud) ? claims.aud : [claims.aud]);
      if (!claims || !GOOGLE_ISSUERS.includes(claims.iss) || !aud.includes(env.GOOGLE_CLIENT_ID) ||
          typeof claims.exp !== 'number' || claims.exp * 1000 <= now()) {
        return page('Sign-in failed', 'Google did not confirm the sign-in. Please try again.', retry, 502, [clearLogin]);
      }
      const email = String(claims.email || '').toLowerCase();
      if (claims.email_verified !== true || email !== allowedEmail) {
        return page('Not allowed', 'The Google account <b>' + escapeHtml(email || 'unknown') +
          '</b> is not allowed on this Blatt server.', { href: at('/auth/login'), label: 'Use another account' }, 403, [clearLogin]);
      }
      const sessionValue = await signValue(await hmacKey(), { typ: 'session', email, exp: Math.floor(now() / 1000) + SESSION_SECONDS });
      return redirect(at('/'), [clearLogin, cookie(SESSION_COOKIE, sessionValue, SESSION_SECONDS)]);
    }

    if (path === '/auth/logout' && method === 'GET') {
      return page('Signed out', 'You are signed out of this Blatt server.', { href: at('/auth/login'), label: 'Sign in again' }, 200,
        [cookie(SESSION_COOKIE, '', 0)]);
    }

    /* ── The app ── */
    if (path === '/' || path === '/index.html' || path === '/cv.html') {
      if (method !== 'GET' && method !== 'HEAD') return respond('Method not allowed', 405, { Allow: 'GET, HEAD' });
      if (!signedIn) return redirect(at('/auth/login'));
      const html = await opts.getAppHtml();
      return respond(method === 'HEAD' ? null : html, 200, { 'Content-Type': 'text/html; charset=utf-8' });
    }

    /* ── Data API ── */
    if (path === '/api/data') {
      if (!signedIn) return json({ error: 'signed-out' }, 401);

      if (method === 'GET') {
        const rec = await storage.get();
        if (!rec) return json({ rev: 0, updatedAt: null, data: null });
        /* `data` was validated as JSON when stored, so it is spliced in verbatim */
        return respond('{"rev":' + rec.rev + ',"updatedAt":' + JSON.stringify(rec.updatedAt) + ',"data":' + rec.data + '}', 200,
          { 'Content-Type': 'application/json; charset=utf-8' });
      }

      if (method === 'PUT') {
        /* CSRF: a custom header can't be sent cross-site without a CORS preflight,
           which this server never grants; Origin, when sent, must be our own. */
        const origin = request.headers.get('Origin');
        if (request.headers.get('X-Blatt-Sync') !== '1' || (origin && origin !== base.origin)) {
          return json({ error: 'forbidden' }, 403);
        }
        const length = Number(request.headers.get('Content-Length') || 0);
        if (length > maxBodyBytes) return json({ error: 'too-large', limit: maxBodyBytes }, 413);
        const text = await request.text();
        if (encoder.encode(text).length > maxBodyBytes) return json({ error: 'too-large', limit: maxBodyBytes }, 413);

        let body;
        try { body = JSON.parse(text); } catch { return json({ error: 'invalid-json' }, 400); }
        if (!body || !Number.isInteger(body.baseRev) || body.baseRev < 0 ||
            !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
          return json({ error: 'invalid-body' }, 400);
        }
        const rec = { rev: body.baseRev + 1, updatedAt: new Date(now()).toISOString(), data: JSON.stringify(body.data) };
        if (await storage.put(body.baseRev, rec)) return json({ rev: rec.rev, updatedAt: rec.updatedAt });
        const current = await storage.get();
        return json({ error: 'conflict', rev: current ? current.rev : 0, updatedAt: current ? current.updatedAt : null }, 409);
      }

      return respond('Method not allowed', 405, { Allow: 'GET, PUT' });
    }

    return respond('Not found', 404, { 'Content-Type': 'text/plain' });
  };
}
