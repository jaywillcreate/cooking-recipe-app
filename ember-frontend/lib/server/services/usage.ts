import 'server-only';
import { config } from '../config';
import { queryOne } from '../db';
import { tooMany } from '../http';

/** Per-user rolling-24h generation cap, enforced against the ai_usage log. */
export async function assertUnderDailyLimit(userId: string): Promise<void> {
  const used = await generationsUsedToday(userId);
  if (used >= config.genDailyLimit) {
    throw tooMany(`Daily creation limit reached (${config.genDailyLimit}/day). It resets on a rolling 24-hour window.`);
  }
}

export async function generationsUsedToday(userId: string): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `SELECT count(*)::text AS n FROM ai_usage
      WHERE user_id = $1 AND success = TRUE AND kind IN ('create','daily')
        AND created_at > now() - interval '24 hours'`,
    [userId],
  );
  return row ? parseInt(row.n, 10) : 0;
}
