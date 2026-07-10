import { config as loadEnv } from 'dotenv';
// .env.local wins over .env (dotenv never overrides already-set vars).
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Add it to .env.local (use the Prisma Postgres DIRECT connection string for migrations).');
  process.exit(1);
}

// Drop `sslmode` from the DSN — TLS is set explicitly via `ssl` below, so it's
// redundant and only triggers pg's "require will change in v9" deprecation warning.
function stripSslMode(dsn: string): string {
  try {
    const u = new URL(dsn);
    u.searchParams.delete('sslmode');
    u.searchParams.delete('ssl');
    return u.toString();
  } catch {
    return dsn;
  }
}

export const pool = new Pool({
  connectionString: stripSslMode(process.env.DATABASE_URL!),
  ssl: (process.env.PGSSLMODE ?? 'require') === 'require' ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 10_000,
});
