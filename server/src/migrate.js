import { pool } from './db.js';
import { schema, columns, modifications } from './schema.js';

// Tables are created idempotently; columns added in later releases are applied only if missing
// (MySQL has no ADD COLUMN IF NOT EXISTS).
export async function migrate() {
  for (const sql of schema) await pool.query(sql);
  for (const [table, column, ddl] of columns) {
    const [rows] = await pool.query(
      'SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?', [table, column]);
    if (!rows.length) await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
  for (const [table, column, ddl, mustContain] of modifications) {
    const [rows] = await pool.query(
      'SELECT column_type t FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?', [table, column]);
    if (rows.length && !rows[0].t.includes(mustContain)) await pool.query(`ALTER TABLE ${table} MODIFY COLUMN ${column} ${ddl}`);
  }
}

if (process.argv[1]?.endsWith('migrate.js')) {
  migrate()
    .then(() => { console.log('✔ Schema is up to date'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
