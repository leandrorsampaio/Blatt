/* Blatt data in Cloudflare D1: one row, compare-and-swap on `rev`.
   Kept apart from worker.mjs (which imports cv.html via the bundler) so
   Node tests can import it. Storage contract: see ../core.mjs. */

export function d1Storage(db) {
  let ready = null;
  /* Created on first use; a failure is not cached, so the next request retries */
  const ensureTable = () => ready || (ready = db.prepare(
    'CREATE TABLE IF NOT EXISTS blatt_data (id INTEGER PRIMARY KEY CHECK (id = 1), rev INTEGER NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL)'
  ).run().catch((err) => { ready = null; throw err; }));
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
