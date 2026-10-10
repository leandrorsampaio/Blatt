/* ================================================================
 *  Blatt server -- Cloudflare Workers adapter (D1 storage)
 *
 *  Deploy from this folder:  npx wrangler deploy
 *  Setup steps: src/server/README.md
 * ================================================================ */
import { createHandler } from '../core.mjs';
import appHtml from '../../../cv.html';

/* D1 limits a row to ~2 MB; the stored document must fit in one row. */
const MAX_BODY_BYTES = 1_900_000;

function d1Storage(db) {
  let ready = null;
  const ensureTable = () => ready || (ready = db.prepare(
    'CREATE TABLE IF NOT EXISTS blatt_data (id INTEGER PRIMARY KEY CHECK (id = 1), rev INTEGER NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL)'
  ).run());
  return {
    async get() {
      await ensureTable();
      const row = await db.prepare('SELECT rev, updated_at, data FROM blatt_data WHERE id = 1').first();
      return row ? { rev: row.rev, updatedAt: row.updated_at, data: row.data } : null;
    },
    async put(baseRev, rec) {
      await ensureTable();
      /* Compare-and-swap in a single statement, so two devices can't both win */
      const result = baseRev === 0
        ? await db.prepare('INSERT INTO blatt_data (id, rev, updated_at, data) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
          .bind(rec.rev, rec.updatedAt, rec.data).run()
        : await db.prepare('UPDATE blatt_data SET rev = ?, updated_at = ?, data = ? WHERE id = 1 AND rev = ?')
          .bind(rec.rev, rec.updatedAt, rec.data, baseRev).run();
      return result.meta.changes === 1;
    },
  };
}

let handler = null;

export default {
  async fetch(request, env) {
    if (!handler) {
      handler = createHandler({ env, storage: d1Storage(env.DB), getAppHtml: () => appHtml, maxBodyBytes: MAX_BODY_BYTES });
    }
    return handler(request);
  },
};
