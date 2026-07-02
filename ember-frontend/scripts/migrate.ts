import fs from 'node:fs';
import path from 'node:path';
import { pool } from './pool';

/** Applies db/schema.sql (idempotent). Run against the DIRECT Postgres URL. */
async function main() {
  const sql = fs.readFileSync(path.resolve(process.cwd(), 'db', 'schema.sql'), 'utf8');
  console.log('Applying schema…');
  await pool.query(sql);
  console.log('✅ Schema applied.');
  await pool.end();
}
main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
