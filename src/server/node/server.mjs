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

export function createNodeServer({ env = process.env, appHtmlPath, dataDir, fetch } = {}) {
  const htmlPath = appHtmlPath || env.APP_HTML || path.resolve(here, '../../../cv.html');
  let html = null;
  const handle = createHandler({
    env,
    storage: fileStorage(dataDir || env.DATA_DIR || path.resolve(here, 'data')),
    getAppHtml: async () => html || (html = await fs.readFile(htmlPath, 'utf8')),
    maxBodyBytes: MAX_BODY_BYTES,
    fetch,
  });

  return http.createServer(async (req, res) => {
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
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
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '127.0.0.1';
  createNodeServer().listen(port, host, () => {
    console.log('Blatt server listening on http://' + host + ':' + port +
      (process.env.PUBLIC_URL ? ' (public address ' + process.env.PUBLIC_URL + ')' : ''));
  });
}
