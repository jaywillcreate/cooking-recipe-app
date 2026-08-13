import 'server-only';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../logger';
import { query, queryOne, ensureDashboardTables } from '../db';

/**
 * Google Calendar integration — deliberately separate from the Google *login*
 * flow (lib/server/services/google.ts): login is access_type=online and drops
 * tokens after use, while this flow requests offline access + the
 * calendar.events scope and stores the refresh token so we can insert
 * meal-plan events on the user's primary calendar later.
 */

const CALENDAR_SCOPE = 'openid email https://www.googleapis.com/auth/calendar.events';

export function calendarRedirectUri(): string {
  return `${config.appOrigin}/api/integrations/google-calendar/callback`;
}

/**
 * The OAuth `state` is a short-lived JWT naming the user, so the browser
 * redirect back from Google (which carries no Authorization header) can be
 * tied to the signed-in account without a session lookup.
 */
export function signCalendarState(userId: string): string {
  return jwt.sign({ sub: userId, purpose: 'gcal' }, config.jwtAccessSecret, { expiresIn: '10m' });
}

export function verifyCalendarState(state: string): string {
  const claims = jwt.verify(state, config.jwtAccessSecret) as { sub: string; purpose?: string };
  if (claims.purpose !== 'gcal') throw new Error('Wrong state purpose');
  return claims.sub;
}

export function buildCalendarAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.googleClientId!,
    redirect_uri: calendarRedirectUri(),
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    state,
    access_type: 'offline',
    prompt: 'consent', // required to re-issue a refresh token on reconnect
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
}

export interface CalendarConnection {
  email: string;
  connectedAt: string;
}

/** Exchange the consent code and persist the connection for the user. */
export async function connectCalendar(userId: string, code: string): Promise<void> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId!,
      client_secret: config.googleClientSecret!,
      redirect_uri: calendarRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Calendar token exchange failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as TokenResponse;
  if (!data.refresh_token || !data.access_token) throw new Error('Google did not return a refresh token');

  // The id_token's email claim is safe to read unverified here: it arrived on
  // our server-to-server exchange directly from Google over TLS.
  const email = data.id_token ? ((jwt.decode(data.id_token) as { email?: string } | null)?.email ?? '') : '';
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);

  await ensureDashboardTables();
  await query(
    `INSERT INTO google_calendar_connections (user_id, google_email, refresh_token, access_token, access_expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET google_email = $2, refresh_token = $3, access_token = $4, access_expires_at = $5`,
    [userId, email, data.refresh_token, data.access_token, expiresAt],
  );
}

export async function getCalendarConnection(userId: string): Promise<CalendarConnection | null> {
  await ensureDashboardTables();
  const row = await queryOne<{ email: string; connectedAt: string }>(
    `SELECT google_email AS "email", created_at AS "connectedAt" FROM google_calendar_connections WHERE user_id = $1`,
    [userId],
  );
  return row;
}

/** Disconnect: best-effort revoke at Google, then drop our copy. */
export async function disconnectCalendar(userId: string): Promise<void> {
  await ensureDashboardTables();
  const row = await queryOne<{ refresh_token: string }>(
    `SELECT refresh_token FROM google_calendar_connections WHERE user_id = $1`,
    [userId],
  );
  if (row) {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: row.refresh_token }),
    }).catch((err) => logger.warn({ err: String(err) }, 'Google token revoke failed'));
  }
  await query(`DELETE FROM google_calendar_connections WHERE user_id = $1`, [userId]);
}

/** Get a live access token, refreshing (and caching) it when expired. */
async function getAccessToken(userId: string): Promise<string | null> {
  await ensureDashboardTables();
  const row = await queryOne<{ refresh_token: string; access_token: string | null; access_expires_at: string | null }>(
    `SELECT refresh_token, access_token, access_expires_at FROM google_calendar_connections WHERE user_id = $1`,
    [userId],
  );
  if (!row) return null;
  if (row.access_token && row.access_expires_at && new Date(row.access_expires_at).getTime() - Date.now() > 60_000) {
    return row.access_token;
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: row.refresh_token,
      client_id: config.googleClientId!,
      client_secret: config.googleClientSecret!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    // invalid_grant means the user revoked access from their Google account —
    // drop the dead connection so the UI offers a clean reconnect.
    if (res.status === 400) await query(`DELETE FROM google_calendar_connections WHERE user_id = $1`, [userId]);
    logger.warn({ status: res.status }, 'Calendar access-token refresh failed');
    return null;
  }
  const data = (await res.json()) as TokenResponse;
  if (!data.access_token) return null;
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);
  await query(`UPDATE google_calendar_connections SET access_token = $1, access_expires_at = $2 WHERE user_id = $3`, [
    data.access_token,
    expiresAt,
    userId,
  ]);
  return data.access_token;
}

/** Default local start times per meal slot (events are 1 hour long). */
const SLOT_TIMES: Record<string, string> = { breakfast: '08:00', lunch: '12:30', snack: '15:30', dinner: '18:30' };

export interface CalendarEventInput {
  date: string; // YYYY-MM-DD (user-local)
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  summary: string;
  description?: string;
  timezone: string;
}

/** Insert a meal-plan event on the user's primary calendar. */
export async function createMealEvent(
  userId: string,
  input: CalendarEventInput,
): Promise<{ eventId: string; htmlLink: string } | null> {
  const token = await getAccessToken(userId);
  if (!token) return null;
  const start = `${input.date}T${SLOT_TIMES[input.slot] ?? '18:30'}:00`;
  const endHour = (SLOT_TIMES[input.slot] ?? '18:30').split(':')[0]!;
  const end = `${input.date}T${String(parseInt(endHour, 10) + 1).padStart(2, '0')}:${(SLOT_TIMES[input.slot] ?? '18:30').split(':')[1]}:00`;
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: input.summary,
      description: input.description ?? '',
      start: { dateTime: start, timeZone: input.timezone },
      end: { dateTime: end, timeZone: input.timezone },
    }),
  });
  if (!res.ok) {
    logger.warn({ status: res.status, body: await res.text() }, 'Calendar event insert failed');
    return null;
  }
  const ev = (await res.json()) as { id: string; htmlLink: string };
  return { eventId: ev.id, htmlLink: ev.htmlLink };
}

/** Best-effort removal of a previously synced event (e.g. plan deleted). */
export async function deleteMealEvent(userId: string, eventId: string): Promise<void> {
  const token = await getAccessToken(userId);
  if (!token) return;
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch((err) => logger.warn({ err: String(err) }, 'Calendar event delete failed'));
}
