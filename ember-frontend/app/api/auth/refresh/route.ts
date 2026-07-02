import { route, unauthorized, json } from '@/lib/server/http';
import { rotateRefreshToken, signAccessToken } from '@/lib/server/services/auth';
import { REFRESH_COOKIE, setRefreshCookie, clearRefreshCookie } from '@/lib/server/authCookies';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const POST = route(async (req: NextRequest) => {
  const raw = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!raw) throw unauthorized('No refresh token');
  const rotated = await rotateRefreshToken(raw, req.headers.get('user-agent') ?? undefined);
  if (!rotated) {
    const res = json({ error: 'unauthorized', message: 'Session expired' }, 401);
    clearRefreshCookie(res);
    return res;
  }
  const res = json({ accessToken: signAccessToken({ sub: rotated.userId, role: rotated.role }) });
  setRefreshCookie(res, rotated.newRaw);
  return res;
});
