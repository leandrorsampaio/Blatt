/* ================================================================
 *  Blatt server -- Cloudflare Workers adapter (D1 storage)
 *
 *  Deploy from this folder:  npx wrangler deploy
 *  Setup steps: src/server/README.md
 * ================================================================ */
import { createHandler } from '../core.mjs';
import appHtml from '../../../cv.html';
import { d1Storage } from './d1-storage.mjs';

/* D1 limits a row to ~2 MB; the stored document must fit in one row. */
const MAX_BODY_BYTES = 1_900_000;

let handler = null;

export default {
  async fetch(request, env) {
    if (!handler) {
      handler = createHandler({ env, storage: d1Storage(env.DB), getAppHtml: () => appHtml, maxBodyBytes: MAX_BODY_BYTES });
    }
    return handler(request);
  },
};
