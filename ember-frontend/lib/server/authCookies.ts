import 'server-only';
import type { NextResponse } from 'next/server';
import { config } from './config';

export const REFRESH_COOKIE = 'ember_rt';

export function setRefreshCookie(res: NextResponse, raw: string): void {
  res.cookies.set(REFRESH_COOKIE, raw, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: config.refreshTtlDays * 86400,
  });
}

export function clearRefreshCookie(res: NextResponse): void {
  res.cookies.set(REFRESH_COOKIE, '', { path: '/api/auth', maxAge: 0 });
}
