import 'server-only';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { config } from './config';

/**
 * Postgres pool. In serverless, module scope can be reused across invocations
 * on a warm instance — cache the pool on globalThis so we don't open a new pool
 * (and leak connections) per request. Use the Prisma Postgres POOLED connection
 * string so the pooler manages the many short-lived serverless connections.
 */
const g = globalThis as unknown as { _emberPool?: Pool };

export function getPool(): Pool {
  if (!g._emberPool) {
    g._emberPool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.pgSsl ? { rejectUnauthorized: false } : undefined,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return g._emberPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(text, params as never[]);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
