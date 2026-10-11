/* ================================================================
 *  Blatt server -- Node adapter (Node 20+, no dependencies)
 *
 *    node src/server/node/server.mjs
 *
 *  Settings come from environment variables (see src/server/README.md).
 *  Data is one JSON file in DATA_DIR. Run it behind an HTTPS reverse
 *  proxy (Caddy, nginx, a PaaS) and set PUBLIC_URL to the public address.
 * ================================================================ */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from '../core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 20_000_000;

/* One JSON file, replaced atomically; writes are serialised in-process. */
export function fileStorage(dir) {
  const file = path.join(dir, 'blatt-data.json');
  let queue = Promise.resolve();
  const read = async () => {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  };
  return {
    get: read,
    put(baseRev, rec) {
      const run = queue.then(async () => {
        const current = await read();
        if ((current ? current.rev : 0) !== baseRev) return false;
        await fs.mkdir(dir, { recursive: true });
        const tmp = file + '.' + process.pid + '.tmp';
        await fs.writeFile(tmp, JSON.stringify(rec));
        await fs.rename(tmp, file);
        return true;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}

/* cv.html and its app/ folder, read from the folder that holds them (the core only asks for safe names) */
export function appFiles(dir) {
  const root = path.resolve(dir);
  return async (name) => {
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep)) return null;
    try { return await fs.readFile(file); } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'EISDIR') return null;
      throw err;
    }
  };
}

export function createNodeServer({ env = process.env, appDir, dataDir, fetch } = {}) {
  const handle = createHandler({
    env,
    storage: fileStorage(dataDir || env.DATA_DIR || path.resolve(here, 'data')),
    getAppFile: appFiles(appDir || env.APP_DIR || path.resolve(here, '../../..')),
    maxBodyBytes: MAX_BODY_BYTES,
    fetch,
  });

  return http.createServer(async (req, res) => {
    try {
      /* Only uploads (PUT api/data) carry a body worth reading; anything else is discarded unread */
      const chunks = [];
      let size = 0;
      if (req.method !== 'PUT') req.resume();
      else for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end('{"error":"too-large"}');
          return;
        }
        chunks.push(chunk);
      }
      const request = new Request('http://' + (req.headers.host || 'localhost') + req.url, {
        method: req.method,
        headers: Object.entries(req.headers).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]])),
        body: req.method === 'PUT' ? Buffer.concat(chunks) : undefined,
      });
      const response = await handle(request);
      const headers = {};
      response.headers.forEach((value, key) => { if (key !== 'set-cookie') headers[key] = value; });
      const setCookies = response.headers.getSetCookie();
      if (setCookies.length) headers['set-cookie'] = setCookies;
      res.writeHead(response.status, headers);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal error');
    }
  });
}

/* Without PUBLIC_URL the address is taken from each request's Host header over plain
   http -- only right for a local try-out. Reachable from elsewhere, insist on it. */
export function publicUrlProblem(env, host) {
  if ((env.PUBLIC_URL || '').trim()) return null;
  if (host === '127.0.0.1' || host === 'localhost' || host === '::1') return null;
  return 'PUBLIC_URL is not set. Set it to the address people open (e.g. https://cv.example.com) ' +
    'when the server listens on ' + host + '. See src/server/README.md.';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '127.0.0.1';
  const problem = publicUrlProblem(process.env, host);
  if (problem) {
    console.error('Blatt server not started: ' + problem);
    process.exit(1);
  }
  createNodeServer().listen(port, host, () => {
    console.log('Blatt server listening on http://' + host + ':' + port +
      (process.env.PUBLIC_URL ? ' (public address ' + process.env.PUBLIC_URL + ')' : ''));
  });
}
