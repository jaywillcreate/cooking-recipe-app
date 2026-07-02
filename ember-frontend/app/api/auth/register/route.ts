import { z } from 'zod';
import { queryOne, tx } from '@/lib/server/db';
import { route, readBody, badRequest, json, clientIp } from '@/lib/server/http';
import { hashPassword, signAccessToken, issueRefreshToken } from '@/lib/server/services/auth';
import { provisionUser } from '@/lib/server/services/users';
import { assertRateLimit } from '@/lib/server/services/rateLimit';
import { setRefreshCookie } from '@/lib/server/authCookies';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(10, 'Use at least 10 characters').max(200),
  name: z.string().max(80).optional(),
});

export const POST = route(async (req: NextRequest) => {
  await assertRateLimit(`register:${clientIp(req)}`, 10, 900, 'Too many attempts. Try again later.');
  const { email, password, name } = await readBody(req, schema);

  if (await queryOne(`SELECT 1 FROM users WHERE email = $1`, [email])) {
    throw badRequest('An account with that email already exists.');
  }

  const passwordHash = await hashPassword(password);
  const userId = await tx((client) => provisionUser(client, { email, passwordHash, name: name ?? '' }));

  const res = json({ accessToken: signAccessToken({ sub: userId, role: 'user' }), user: { id: userId, email, role: 'user' } }, 201);
  setRefreshCookie(res, await issueRefreshToken(userId, req.headers.get('user-agent') ?? undefined));
  return res;
});
