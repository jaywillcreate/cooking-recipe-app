import { route, json } from '@/lib/server/http';
import { revokeRefreshToken } from '@/lib/server/services/auth';
import { REFRESH_COOKIE, clearRefreshCookie } from '@/lib/server/authCookies';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const POST = route(async (req: NextRequest) => {
  const raw = req.cookies.get(REFRESH_COOKIE)?.value;
  if (raw) await revokeRefreshToken(raw);
  const res = json({ ok: true });
  clearRefreshCookie(res);
  return res;
});
