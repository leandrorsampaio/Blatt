/* Blatt server tests -- run with:  node --test src/server/test/
   No dependencies; Google is replaced by a fake token endpoint. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHandler } from '../core.mjs';
import { createNodeServer, fileStorage } from '../node/server.mjs';

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

function setup({ env = ENV, claims, google, now } = {}) {
  const g = google || fakeGoogle(claims);
  const handle = createHandler({ env, storage: memoryStorage(), getAppHtml: () => '<html>BLATT APP</html>', fetch: g.fetch, now, maxBodyBytes: 1000 });
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
  const html = path.join(dir, 'cv.html');
  await fs.writeFile(html, '<html>REAL APP</html>');
  const server = createNodeServer({ env: ENV, appHtmlPath: html, dataDir: path.join(dir, 'data'), fetch: fakeGoogle().fetch });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    const login = await fetch(origin + '/auth/login', { redirect: 'manual' });
    const state = new URL(login.headers.get('Location')).searchParams.get('state');
    const loginCookie = login.headers.getSetCookie()[0].split(';')[0];
    const cb = await fetch(origin + '/auth/callback?code=abc&state=' + state, { redirect: 'manual', headers: { Cookie: loginCookie } });
    const session = cb.headers.getSetCookie().find((c) => c.startsWith('blatt_session=')).split(';')[0];
    assert.equal(await (await fetch(origin + '/', { headers: { Cookie: session } })).text(), '<html>REAL APP</html>');
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
