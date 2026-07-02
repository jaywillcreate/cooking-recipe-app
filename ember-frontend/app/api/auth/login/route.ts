import { z } from 'zod';
import { query, queryOne } from '@/lib/server/db';
import { route, readBody, unauthorized, json, clientIp } from '@/lib/server/http';
import { verifyPassword, signAccessToken, issueRefreshToken, type Role } from '@/lib/server/services/auth';
import { assertRateLimit } from '@/lib/server/services/rateLimit';
import { setRefreshCookie } from '@/lib/server/authCookies';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const schema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export const POST = route(async (req: NextRequest) => {
  await assertRateLimit(`login:${clientIp(req)}`, 20, 900, 'Too many attempts. Try again later.');
  const { email, password } = await readBody(req, schema);

  const user = await queryOne<{ id: string; password_hash: string; role: Role; status: string }>(
    `SELECT id, password_hash, role, status FROM users WHERE email = $1`,
    [email],
  );
  // Always run a verify to blunt user-enumeration timing.
  const ok = user
    ? await verifyPassword(user.password_hash, password)
    : await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$b2d5bWluZ3RoZWhhc2hoYXNo', password);

  if (!user || !ok) throw unauthorized('Invalid email or password.');
  if (user.status !== 'active') throw unauthorized('This account is not active.');

  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);
  const res = json({ accessToken: signAccessToken({ sub: user.id, role: user.role }), user: { id: user.id, email, role: user.role } });
  setRefreshCookie(res, await issueRefreshToken(user.id, req.headers.get('user-agent') ?? undefined));
  return res;
});
