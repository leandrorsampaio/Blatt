/* ================================================================
 *  Blatt server -- Cloudflare Workers adapter (D1 storage)
 *
 *  Deploy from this folder:  npx wrangler deploy
 *  Setup steps: src/server/README.md
 * ================================================================ */
import { createHandler } from '../core.mjs';
import { d1Storage } from './d1-storage.mjs';

/* D1 limits a row to ~2 MB; the stored document must fit in one row. */
const MAX_BODY_BYTES = 1_900_000;

let handler = null;

/* cv.html and app/ are uploaded as static assets (see wrangler.toml); the worker
   runs first on every request, so they are only handed out after sign-in. */
async function assetFile(env, name) {
  const res = await env.ASSETS.fetch(new Request('https://assets.invalid/' + name));
  return res.ok ? res.arrayBuffer() : null;
}

export default {
  async fetch(request, env) {
    if (!handler) {
      handler = createHandler({ env, storage: d1Storage(env.DB), getAppFile: (name) => assetFile(env, name), maxBodyBytes: MAX_BODY_BYTES });
    }
    return handler(request);
  },
};
