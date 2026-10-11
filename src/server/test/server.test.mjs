/* Blatt server tests -- run with:  node --test src/server/test/
   No dependencies; Google is replaced by a fake token endpoint. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHandler } from '../core.mjs';
import { createNodeServer, fileStorage, publicUrlProblem } from '../node/server.mjs';
import { d1Storage } from '../cloudflare/d1-storage.mjs';

const ENV = {
  GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'shh',
  ALLOWED_EMAIL: 'Owner@Example.com',
  SESSION_SECRET: 'x'.repeat(40),
};
const ORIGIN = 'https://blatt.example.com';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function memoryStorage() {
  let rec = null;
  return {
    get: async () => rec,
    put: async (baseRev, next) => {
      if ((rec ? rec.rev : 0) !== baseRev) return false;
      rec = next;
      return true;
    },
  };
}

/* A fake Google token endpoint; records what it was sent. */
function fakeGoogle(claims = {}, opts = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, body: new URLSearchParams(init.body) });
    if (opts.fail) return new Response('{"error":"invalid_grant"}', { status: 400 });
    const payload = { iss: 'https://accounts.google.com', aud: ENV.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 3600,
      email: 'owner@example.com', email_verified: true, ...claims };
    return Response.json({ id_token: b64url({ alg: 'RS256' }) + '.' + b64url(payload) + '.sig' });
  };
  return { fetch, calls };
}

const APP = { 'cv.html': '<html>BLATT APP</html>', 'app/js/boot.js': 'boot();', 'app/css/cv.css': '.page{}' };

function setup({ env = ENV, claims, google, now } = {}) {
  const g = google || fakeGoogle(claims);
  const handle = createHandler({ env, storage: memoryStorage(), getAppFile: (name) => APP[name] ?? null, fetch: g.fetch, now, maxBodyBytes: 1000 });
  const call = (p, init = {}) => handle(new Request(new URL(p, env.PUBLIC_URL ? env.PUBLIC_URL + '/' : ORIGIN), init));
  return { handle, call, google: g };
}

function cookiesFrom(res) {
  return Object.fromEntries(res.headers.getSetCookie().map((c) => {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    return [pair.slice(0, i), pair.slice(i + 1)];
  }));
}

/* Walk the full sign-in flow; returns the session cookie header. */
async function signIn(ctx) {
  const login = await ctx.call('/auth/login');
  const loc = new URL(login.headers.get('Location'));
  const loginCookie = cookiesFrom(login).blatt_login;
  const cb = await ctx.call('/auth/callback?code=abc&state=' + loc.searchParams.get('state'), { headers: { Cookie: 'blatt_login=' + loginCookie } });
  return { cb, loc, cookie: 'blatt_session=' + cookiesFrom(cb).blatt_session };
}

const putData = (ctx, cookie, body, headers = {}) => ctx.call('/api/data', {
  method: 'PUT', body: JSON.stringify(body),
  headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Blatt-Sync': '1', ...headers },
});

/* ── Configuration ── */

test('missing settings show a setup page, health check still answers', async () => {
  const ctx = setup({ env: { GOOGLE_CLIENT_ID: 'x', SESSION_SECRET: 'short' } });
  const res = await ctx.call('/');
  assert.equal(res.status, 500);
  const text = await res.text();
  assert.match(text, /GOOGLE_CLIENT_SECRET/);
  assert.match(text, /ALLOWED_EMAIL/);
  assert.match(text, /at least 32 characters/);
  assert.equal((await ctx.call('/healthz')).status, 200);
});

/* ── Sign-in ── */

test('signed-out visitors are sent to sign in; the API answers 401', async () => {
  const ctx = setup();
  const res = await ctx.call('/');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), ORIGIN + '/auth/login');
  assert.equal((await ctx.call('/api/data')).status, 401);
});

test('login redirects to Google with state, PKCE and a short-lived login cookie', async () => {
  const ctx = setup();
  const res = await ctx.call('/auth/login');
  const loc = new URL(res.headers.get('Location'));
  assert.equal(loc.origin + loc.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(loc.searchParams.get('client_id'), ENV.GOOGLE_CLIENT_ID);
  assert.equal(loc.searchParams.get('redirect_uri'), ORIGIN + '/auth/callback');
  assert.equal(loc.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(loc.searchParams.get('state').length >= 32);
  const setCookie = res.headers.getSetCookie()[0];
  assert.match(setCookie, /^blatt_login=.*HttpOnly; SameSite=Lax; Secure$/);
});

test('full sign-in flow for the allowed account gives access to the app', async () => {
  const ctx = setup();
  const { cb, cookie } = await signIn(ctx);
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get('Location'), ORIGIN + '/');
  assert.equal(cookiesFrom(cb).blatt_login, '');           /* login cookie cleared */
  const app = await ctx.call('/', { headers: { Cookie: cookie } });
  assert.equal(app.status, 200);
  assert.equal(await app.text(), '<html>BLATT APP</html>');
  assert.equal(app.headers.get('Cache-Control'), 'no-store');
  assert.equal(app.headers.get('Referrer-Policy'), 'no-referrer');
});

test('the token exchange sends the PKCE verifier matching the challenge', async () => {
  const ctx = setup();
  const { loc } = await signIn(ctx);
  const sent = ctx.google.calls[0].body;
  assert.equal(sent.get('grant_type'), 'authorization_code');
  assert.equal(sent.get('client_secret'), ENV.GOOGLE_CLIENT_SECRET);
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sent.get('code_verifier')))).toString('base64url');
  assert.equal(challenge, loc.searchParams.get('code_challenge'));
});

test('a different Google account is refused', async () => {
  const ctx = setup({ claims: { email: 'intruder@example.com' } });
  const { cb } = await signIn(ctx);
  assert.equal(cb.status, 403);
  assert.match(await cb.text(), /intruder@example\.com/);
  assert.equal(cookiesFrom(cb).blatt_session, undefined);
});

test('unverified email, wrong audience, wrong issuer and expired tokens are refused', async () => {
  for (const claims of [{ email_verified: false }, { aud: 'someone-else' }, { iss: 'https://evil.example' }, { exp: 1 }]) {
    const { cb } = await signIn(setup({ claims }));
    assert.ok(cb.status === 403 || cb.status === 502, JSON.stringify(claims) + ' -> ' + cb.status);
    assert.equal(cookiesFrom(cb).blatt_session, undefined);
  }
});

test('a failed token exchange is refused', async () => {
  const { cb } = await signIn(setup({ google: fakeGoogle({}, { fail: true }) }));
  assert.equal(cb.status, 502);
});

test('callback without the matching login cookie/state is refused', async () => {
  const ctx = setup();
  const login = await ctx.call('/auth/login');
  const loginCookie = cookiesFrom(login).blatt_login;
  const noCookie = await ctx.call('/auth/callback?code=abc&state=' + new URL(login.headers.get('Location')).searchParams.get('state'));
  assert.equal(noCookie.status, 400);
  const wrongState = await ctx.call('/auth/callback?code=abc&state=forged', { headers: { Cookie: 'blatt_login=' + loginCookie } });
  assert.equal(wrongState.status, 400);
  assert.equal(ctx.google.calls.length, 0);
});

test('tampered, expired, or login-type cookies are not sessions', async () => {
  let clock = Date.now();
  const ctx = setup({ now: () => clock });
  const { cookie } = await signIn(ctx);
  const [body, sig] = cookie.slice('blatt_session='.length).split('.');
  const forgedBody = Buffer.from(JSON.stringify({ typ: 'session', email: 'owner@example.com', exp: 9e9 })).toString('base64url');
  assert.equal((await ctx.call('/api/data', { headers: { Cookie: 'blatt_session=' + forgedBody + '.' + sig } })).status, 401);
  assert.equal((await ctx.call('/api/data', { headers: { Cookie: 'blatt_session=' + body + '.AAAA' } })).status, 401);
  const loginCookie = cookiesFrom(await ctx.call('/auth/login')).blatt_login;
  assert.equal((await ctx.call('/api/data', { headers: { Cookie: 'blatt_session=' + loginCookie } })).status, 401);
  assert.equal((await ctx.call('/api/data', { headers: { Cookie: cookie } })).status, 200);
  clock += 31 * 24 * 3600 * 1000;
  assert.equal((await ctx.call('/api/data', { headers: { Cookie: cookie } })).status, 401);
});

test('changing ALLOWED_EMAIL invalidates existing sessions', async () => {
  const ctx = setup();
  const { cookie } = await signIn(ctx);
  const other = setup({ env: { ...ENV, ALLOWED_EMAIL: 'new-owner@example.com' } });
  assert.equal((await other.call('/api/data', { headers: { Cookie: cookie } })).status, 401);
});

test('logout clears the session cookie', async () => {
  const ctx = setup();
  const res = await ctx.call('/auth/logout');
  assert.equal(res.status, 200);
  assert.match(res.headers.getSetCookie()[0], /^blatt_session=; .*Max-Age=0/);
});

/* ── Data API ── */

test('data API: empty, save, conflict, reload', async () => {
  const ctx = setup();
  const { cookie } = await signIn(ctx);
  assert.deepEqual(await (await ctx.call('/api/data', { headers: { Cookie: cookie } })).json(), { rev: 0, updatedAt: null, data: null });

  const first = await putData(ctx, cookie, { baseRev: 0, data: { keys: { 'cv-a': '1' } } });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).rev, 1);

  const stale = await putData(ctx, cookie, { baseRev: 0, data: { keys: { 'cv-a': 'stale' } } });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).rev, 1);

  const second = await putData(ctx, cookie, { baseRev: 1, data: { keys: { 'cv-a': '2' } } });
  assert.equal((await second.json()).rev, 2);

  const got = await (await ctx.call('/api/data', { headers: { Cookie: cookie } })).json();
  assert.equal(got.rev, 2);
  assert.deepEqual(got.data, { keys: { 'cv-a': '2' } });
});

test('data API rejects missing CSRF header, foreign origin, bad bodies and oversize uploads', async () => {
  const ctx = setup();
  const { cookie } = await signIn(ctx);
  const ok = { baseRev: 0, data: { keys: {} } };
  assert.equal((await putData(ctx, cookie, ok, { 'X-Blatt-Sync': '' })).status, 403);
  assert.equal((await putData(ctx, cookie, ok, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await putData(ctx, cookie, ok, { Origin: ORIGIN })).status, 200);
  assert.equal((await putData(ctx, cookie, { baseRev: -1, data: {} })).status, 400);
  assert.equal((await putData(ctx, cookie, { baseRev: 1, data: [1] })).status, 400);
  assert.equal((await putData(ctx, cookie, { baseRev: 1, data: { big: 'x'.repeat(2000) } })).status, 413);
  assert.equal((await ctx.call('/api/data', { method: 'DELETE', headers: { Cookie: cookie } })).status, 405);
});

test('PUBLIC_URL with a sub-path is honoured in redirects, routes and cookies', async () => {
  const env = { ...ENV, PUBLIC_URL: 'https://example.com/blatt/' };
  const ctx = setup({ env });
  const login = await ctx.call('https://example.com/blatt/auth/login');
  assert.equal(new URL(login.headers.get('Location')).searchParams.get('redirect_uri'), 'https://example.com/blatt/auth/callback');
  assert.match(login.headers.getSetCookie()[0], /Path=\/blatt;/);
  /* A proxy that strips the prefix works too */
  assert.equal((await ctx.call('https://internal:8080/')).headers.get('Location'), 'https://example.com/blatt/auth/login');
});

/* ── Node adapter ── */

test('file storage: compare-and-swap survives concurrent writers', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'blatt-'));
  const store = fileStorage(dir);
  assert.equal(await store.get(), null);
  const results = await Promise.all([1, 2, 3].map((n) => store.put(0, { rev: 1, updatedAt: 'now', data: String(n) })));
  assert.deepEqual(results.filter(Boolean).length, 1);
  assert.equal((await store.get()).rev, 1);
  await fs.rm(dir, { recursive: true });
});

test('node server: end to end over real HTTP', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'blatt-'));
  await fs.writeFile(path.join(dir, 'cv.html'), '<html>REAL APP</html>');
  await fs.mkdir(path.join(dir, 'app', 'js'), { recursive: true });
  await fs.writeFile(path.join(dir, 'app', 'js', 'boot.js'), 'boot();');
  await fs.writeFile(path.join(dir, 'secret.js'), 'not served');
  const server = createNodeServer({ env: ENV, appDir: dir, dataDir: path.join(dir, 'data'), fetch: fakeGoogle().fetch });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    const login = await fetch(origin + '/auth/login', { redirect: 'manual' });
    const state = new URL(login.headers.get('Location')).searchParams.get('state');
    const loginCookie = login.headers.getSetCookie()[0].split(';')[0];
    const cb = await fetch(origin + '/auth/callback?code=abc&state=' + state, { redirect: 'manual', headers: { Cookie: loginCookie } });
    const session = cb.headers.getSetCookie().find((c) => c.startsWith('blatt_session=')).split(';')[0];
    assert.equal(await (await fetch(origin + '/', { headers: { Cookie: session } })).text(), '<html>REAL APP</html>');
    const js = await fetch(origin + '/app/js/boot.js', { headers: { Cookie: session } });
    assert.equal(js.headers.get('Content-Type'), 'text/javascript; charset=utf-8');
    assert.equal(await js.text(), 'boot();');
    assert.equal((await fetch(origin + '/app/js/none.js', { headers: { Cookie: session } })).status, 404);
    assert.equal((await fetch(origin + '/app/%2e%2e/secret.js', { headers: { Cookie: session } })).status, 404);
    assert.equal((await fetch(origin + '/secret.js', { headers: { Cookie: session } })).status, 404);
    const put = await fetch(origin + '/api/data', { method: 'PUT', headers: { Cookie: session, 'X-Blatt-Sync': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRev: 0, data: { keys: { 'cv-x': 'y' } } }) });
    assert.equal(put.status, 200);
    const saved = JSON.parse(await fs.readFile(path.join(dir, 'data', 'blatt-data.json'), 'utf8'));
    assert.equal(saved.rev, 1);
    const big = await fetch(origin + '/api/data', { method: 'PUT', headers: { Cookie: session, 'X-Blatt-Sync': '1' }, body: 'x'.repeat(21_000_000) });
    assert.equal(big.status, 413);
  } finally {
    server.close();
    await fs.rm(dir, { recursive: true });
  }
});

/* ── Review follow-ups ── */

test('settings are trimmed: a pasted trailing newline does not break sign-in', async () => {
  const env = { ...ENV, GOOGLE_CLIENT_ID: ENV.GOOGLE_CLIENT_ID + '\n', ALLOWED_EMAIL: '  owner@example.com \n', SESSION_SECRET: ENV.SESSION_SECRET + '\n' };
  const ctx = setup({ env });
  const login = await ctx.call('/auth/login');
  assert.equal(new URL(login.headers.get('Location')).searchParams.get('client_id'), ENV.GOOGLE_CLIENT_ID);
  const { cb, cookie } = await signIn(ctx);
  assert.equal(cb.status, 302);
  assert.equal((await ctx.call('/api/data', { headers: { Cookie: cookie } })).status, 200);
});

test('the login cookie expires after 10 minutes', async () => {
  let clock = Date.now();
  const ctx = setup({ now: () => clock });
  const login = await ctx.call('/auth/login');
  const state = new URL(login.headers.get('Location')).searchParams.get('state');
  clock += 11 * 60 * 1000;
  const cb = await ctx.call('/auth/callback?code=abc&state=' + state, { headers: { Cookie: 'blatt_login=' + cookiesFrom(login).blatt_login } });
  assert.equal(cb.status, 400);
  assert.equal(ctx.google.calls.length, 0);
});

test('stored data with quotes, backslashes and non-ASCII round-trips exactly', async () => {
  const handle = createHandler({ env: ENV, storage: memoryStorage(), getAppFile: () => '', fetch: fakeGoogle().fetch });
  const ctx = { call: (p, init = {}) => handle(new Request(new URL(p, ORIGIN), init)), google: { calls: [] } };
  const { cookie } = await signIn(ctx);
  const data = { format: 'blatt-sync', version: 1, keys: { 'cv-x': 'He said "hi" \\ back\\slash, ünïcödé 😀 </script>\n\t' } };
  assert.equal((await putData(ctx, cookie, { baseRev: 0, data })).status, 200);
  const text = await (await ctx.call('/api/data', { headers: { Cookie: cookie } })).text();
  const got = JSON.parse(text);
  assert.deepEqual(got.data, data);
  /* the browser compares JSON.stringify(server.data) with its own snapshot string */
  assert.equal(JSON.stringify(got.data), JSON.stringify(data));
});

test('the app folder is served after sign-in only, with its content types', async () => {
  const ctx = setup();
  const out = await ctx.call('/app/js/boot.js');
  assert.equal(out.status, 401);
  assert.equal(await out.text(), 'Signed out');
  const { cookie } = await signIn(ctx);
  const js = await ctx.call('/app/js/boot.js', { headers: { Cookie: cookie } });
  assert.equal(js.status, 200);
  assert.equal(js.headers.get('Content-Type'), 'text/javascript; charset=utf-8');
  assert.equal(js.headers.get('Cache-Control'), 'no-store');
  assert.equal(await js.text(), 'boot();');
  const css = await ctx.call('/app/css/cv.css', { headers: { Cookie: cookie } });
  assert.equal(css.headers.get('Content-Type'), 'text/css; charset=utf-8');
  assert.equal((await ctx.call('/app/js/missing.js', { headers: { Cookie: cookie } })).status, 404);
  assert.equal((await ctx.call('/app/js/boot.js', { method: 'PUT', headers: { Cookie: cookie } })).status, 405);
});

test('only plain app/ file names reach the adapter', async () => {
  const asked = [];
  const handle = createHandler({ env: ENV, storage: memoryStorage(), getAppFile: (name) => { asked.push(name); return 'x'; }, fetch: fakeGoogle().fetch });
  const ctx = { call: (p, init = {}) => handle(new Request(new URL(p, ORIGIN), init)), google: { calls: [] } };
  const { cookie } = await signIn(ctx);
  for (const p of ['/app/.env.js', '/app/js/.hidden.css', '/app/js/x.txt', '/app/js/x.mjs', '/app/', '/app', '/src/server/core.mjs',
    '/README.md', '/app/js//x.js', '/app/js/x%2fy.js', '/app/%2e%2e/%2e%2e/etc.js']) {
    const res = await ctx.call(p, { headers: { Cookie: cookie } });
    assert.ok(res.status === 404 || res.status === 302, p + ' -> ' + res.status);
  }
  assert.deepEqual(asked.filter((n) => n !== 'cv.html'), []);
  await ctx.call('/app/vendor/html2pdf.bundle.min.js', { headers: { Cookie: cookie } });
  assert.deepEqual(asked.filter((n) => n !== 'cv.html'), ['app/vendor/html2pdf.bundle.min.js']);
});

test('HEAD on the app answers without a body; unknown methods are refused', async () => {
  const ctx = setup();
  const { cookie } = await signIn(ctx);
  const head = await ctx.call('/', { method: 'HEAD', headers: { Cookie: cookie } });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await ctx.call('/', { method: 'POST', headers: { Cookie: cookie } })).status, 405);
  assert.equal((await ctx.call('/api/data', { method: 'OPTIONS', headers: { Cookie: cookie } })).status, 405);
});

test('Node refuses a public address without PUBLIC_URL', () => {
  assert.equal(publicUrlProblem({}, '127.0.0.1'), null);
  assert.equal(publicUrlProblem({}, 'localhost'), null);
  assert.equal(publicUrlProblem({ PUBLIC_URL: 'https://cv.example.com' }, '0.0.0.0'), null);
  assert.match(publicUrlProblem({}, '0.0.0.0'), /PUBLIC_URL/);
  assert.match(publicUrlProblem({ PUBLIC_URL: '  ' }, '0.0.0.0'), /PUBLIC_URL/);
});

/* Minimal stand-in for a D1 binding: records SQL, answers like D1 does */
function fakeD1({ failCreateOnce = false } = {}) {
  let row = null, createFailures = failCreateOnce ? 1 : 0;
  const sql = [];
  const prepare = (q) => {
    const stmt = { args: [], bind(...a) { stmt.args = a; return stmt; } };
    stmt.run = async () => {
      sql.push(q);
      if (q.startsWith('CREATE')) { if (createFailures-- > 0) throw new Error('D1 busy'); return { meta: { changes: 0 } }; }
      if (q.startsWith('INSERT')) {
        if (row) return { meta: { changes: 0 } };
        row = { rev: stmt.args[0], updated_at: stmt.args[1], data: stmt.args[2] };
        return { meta: { changes: 1 } };
      }
      if (q.startsWith('UPDATE')) {
        if (!row || row.rev !== stmt.args[3]) return { meta: { changes: 0 } };
        row = { rev: stmt.args[0], updated_at: stmt.args[1], data: stmt.args[2] };
        return { meta: { changes: 1 } };
      }
    };
    stmt.first = async () => { sql.push(q); return row; };
    return stmt;
  };
  return { prepare, sql };
}

test('D1 storage: insert and update branches of compare-and-swap', async () => {
  const db = fakeD1();
  const store = d1Storage(db);
  assert.equal(await store.get(), null);
  assert.equal(await store.put(0, { rev: 1, updatedAt: 't1', data: '{"a":1}' }), true);
  assert.equal(await store.put(0, { rev: 1, updatedAt: 't1b', data: '{}' }), false);  /* row exists */
  assert.equal(await store.put(5, { rev: 6, updatedAt: 't2', data: '{}' }), false);   /* stale base */
  assert.equal(await store.put(1, { rev: 2, updatedAt: 't2', data: '{"a":2}' }), true);
  assert.deepEqual(await store.get(), { rev: 2, updatedAt: 't2', data: '{"a":2}' });
  assert.equal(db.sql.filter((q) => q.startsWith('CREATE')).length, 1);               /* created once */
});

test('D1 storage: a failed CREATE TABLE is retried, not cached', async () => {
  const store = d1Storage(fakeD1({ failCreateOnce: true }));
  await assert.rejects(store.get(), /D1 busy/);
  assert.equal(await store.get(), null);
});

test('node server: chunked PUT without Content-Length works; bodies on other methods are ignored', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'blatt-'));
  const server = createNodeServer({ env: ENV, appDir: path.join(dir, 'none'), dataDir: dir, fetch: fakeGoogle().fetch });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    const login = await fetch(origin + '/auth/login', { redirect: 'manual' });
    const state = new URL(login.headers.get('Location')).searchParams.get('state');
    const cb = await fetch(origin + '/auth/callback?code=abc&state=' + state, { redirect: 'manual', headers: { Cookie: login.headers.getSetCookie()[0].split(';')[0] } });
    const session = cb.headers.getSetCookie().find((c) => c.startsWith('blatt_session=')).split(';')[0];
    const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"baseRev":0,"data":{"keys":{}}}')); c.close(); } });
    const put = await fetch(origin + '/api/data', { method: 'PUT', body, duplex: 'half', headers: { Cookie: session, 'X-Blatt-Sync': '1' } });
    assert.equal(put.status, 200);
    const post = await fetch(origin + '/api/data', { method: 'POST', body: 'x'.repeat(1000), headers: { Cookie: session } });
    assert.equal(post.status, 405);
  } finally {
    server.close();
    await fs.rm(dir, { recursive: true });
  }
});
