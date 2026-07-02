import { NextResponse, type NextRequest } from 'next/server';
import { config } from '@/lib/server/config';
import { query, queryOne, tx } from '@/lib/server/db';
import { exchangeCodeForToken, fetchGoogleProfile } from '@/lib/server/services/google';
import { provisionUser } from '@/lib/server/services/users';
import { issueRefreshToken } from '@/lib/server/services/auth';
import { setRefreshCookie } from '@/lib/server/authCookies';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const OAUTH_STATE_COOKIE = 'ember_oauth_state';

interface UserRow {
  id: string;
  role: string;
  status: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl;

  const fail = (msg: string): NextResponse => {
    const r = NextResponse.redirect(new URL('/login?error=' + encodeURIComponent(msg), config.appOrigin));
    r.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/api/auth/google', maxAge: 0 });
    return r;
  };

  if (!config.googleEnabled) return fail('Google sign-in is not configured.');
  if (url.searchParams.get('error')) return fail('Google sign-in was cancelled.');

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail('Sign-in verification failed. Please try again.');
  }

  try {
    const token = await exchangeCodeForToken(code);
    const profile = await fetchGoogleProfile(token);
    if (!profile.email || !profile.email_verified) return fail('Your Google email is not verified.');

    // Find by Google id → else link by email → else create.
    let user = await queryOne<UserRow>(`SELECT id, role, status FROM users WHERE google_id = $1`, [profile.sub]);
    let isNew = false;
    if (!user) {
      const byEmail = await queryOne<UserRow>(`SELECT id, role, status FROM users WHERE email = $1`, [profile.email]);
      if (byEmail) {
        await query(`UPDATE users SET google_id = $1, email_verified = TRUE WHERE id = $2`, [profile.sub, byEmail.id]);
        user = byEmail;
      } else {
        const id = await tx((client) =>
          provisionUser(client, { email: profile.email, googleId: profile.sub, name: profile.name ?? '', avatarUrl: profile.picture ?? null }),
        );
        user = { id, role: 'user', status: 'active' };
        isNew = true;
      }
    }
    if (user.status !== 'active') return fail('This account is not active.');

    await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);
    const raw = await issueRefreshToken(user.id, req.headers.get('user-agent') ?? undefined);

    const res = NextResponse.redirect(new URL(isNew ? '/profile' : '/discover', config.appOrigin));
    setRefreshCookie(res, raw);
    res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/api/auth/google', maxAge: 0 });
    return res;
  } catch (err) {
    logger.error({ err: String(err) }, 'Google OAuth callback failed');
    return fail('Google sign-in failed. Please try again.');
  }
}
