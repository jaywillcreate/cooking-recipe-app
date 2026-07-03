import { z } from 'zod';
import { route, requireUser, readBody, json, badRequest, unauthorized } from '@/lib/server/http';
import { query, queryOne } from '@/lib/server/db';
import { hashPassword, verifyPassword } from '@/lib/server/services/auth';
import { assertRateLimit } from '@/lib/server/services/rateLimit';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const schema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(10, 'Use at least 10 characters').max(200),
});

/**
 * Change (or, for Google-only accounts, set) the account password.
 * Requires the current password when one already exists.
 */
export const POST = route(async (req: NextRequest) => {
  const u = requireUser(req);
  // Throttle to blunt guessing of the current password.
  await assertRateLimit(`pwchange:${u.id}`, 10, 900, 'Too many attempts. Try again in a few minutes.');

  const { currentPassword, newPassword } = await readBody(req, schema);
  const row = await queryOne<{ password_hash: string | null }>(`SELECT password_hash FROM users WHERE id = $1`, [u.id]);
  if (!row) throw unauthorized();

  if (row.password_hash) {
    if (!currentPassword) throw badRequest('Enter your current password.');
    const ok = await verifyPassword(row.password_hash, currentPassword);
    if (!ok) throw badRequest('Your current password is incorrect.');
    if (currentPassword === newPassword) throw badRequest('Choose a different password than your current one.');
  }

  const hash = await hashPassword(newPassword);
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, u.id]);
  return json({ ok: true });
});
