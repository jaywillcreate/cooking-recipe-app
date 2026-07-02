import 'server-only';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { config } from './config';

const ADMIN_COOKIE = 'ember_admin';
export interface AdminSession {
  sub: string;
  email: string;
}

/** Read + verify the admin session cookie (safe to call in any server code). */
export function readAdminSession(): AdminSession | null {
  const raw = cookies().get(ADMIN_COOKIE)?.value;
  if (!raw) return null;
  try {
    const claims = jwt.verify(raw, config.adminSessionSecret) as AdminSession & { typ?: string };
    return { sub: claims.sub, email: claims.email };
  } catch {
    return null;
  }
}

/** Set the admin session cookie. MUST be called from a Server Action / Route. */
export function setAdminSession(session: AdminSession): void {
  const token = jwt.sign(session, config.adminSessionSecret, { expiresIn: '8h' });
  cookies().set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    path: '/admin',
    maxAge: 8 * 60 * 60,
  });
}

export function clearAdminSession(): void {
  cookies().set(ADMIN_COOKIE, '', { path: '/admin', maxAge: 0 });
}
