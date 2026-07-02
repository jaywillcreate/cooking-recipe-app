import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { config } from '@/lib/server/config';
import { buildGoogleAuthUrl } from '@/lib/server/services/google';

export const dynamic = 'force-dynamic';

const OAUTH_STATE_COOKIE = 'ember_oauth_state';

export function GET(_req: NextRequest): NextResponse {
  if (!config.googleEnabled) {
    return NextResponse.redirect(new URL('/login?error=' + encodeURIComponent('Google sign-in is not configured.'), config.appOrigin));
  }
  const state = crypto.randomBytes(24).toString('hex');
  const res = NextResponse.redirect(buildGoogleAuthUrl(state));
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax', // sent on the top-level GET redirect back from Google
    path: '/api/auth/google',
    maxAge: 600,
  });
  return res;
}
