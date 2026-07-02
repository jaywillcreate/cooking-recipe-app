import 'server-only';
import { queryOne } from '../db';
import { tooMany } from '../http';

/**
 * Fixed-window rate limiter backed by Postgres, so it works across ephemeral
 * serverless instances (an in-memory limiter would reset every cold start).
 * Returns the current count; caller decides. Atomic via a single upsert.
 */
export async function hitRateLimit(bucket: string, windowSeconds: number): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `INSERT INTO rate_limits (bucket, count, reset_at)
       VALUES ($1, 1, now() + ($2 || ' seconds')::interval)
     ON CONFLICT (bucket) DO UPDATE SET
       count    = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at < now() THEN now() + ($2 || ' seconds')::interval ELSE rate_limits.reset_at END
     RETURNING count`,
    [bucket, String(windowSeconds)],
  );
  return row?.count ?? 1;
}

export async function assertRateLimit(bucket: string, limit: number, windowSeconds: number, message?: string): Promise<void> {
  const count = await hitRateLimit(bucket, windowSeconds);
  if (count > limit) throw tooMany(message ?? 'Too many requests — try again shortly.');
}
