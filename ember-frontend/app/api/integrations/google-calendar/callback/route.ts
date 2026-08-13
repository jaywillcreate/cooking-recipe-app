import { NextResponse, type NextRequest } from 'next/server';
import { config } from '@/lib/server/config';
import { connectCalendar, verifyCalendarState } from '@/lib/server/services/googleCalendar';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

/** Browser redirect back from Google's consent screen. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl;
  const back = (result: 'connected' | 'error', msg?: string) =>
    NextResponse.redirect(
      new URL(`/profile?calendar=${result}${msg ? `&reason=${encodeURIComponent(msg)}` : ''}#connections`, config.appOrigin),
    );

  if (!config.googleEnabled) return back('error', 'Google integration is not configured.');
  if (url.searchParams.get('error')) return back('error', 'Google access was declined.');

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return back('error', 'Missing authorization code.');

  try {
    const userId = verifyCalendarState(state);
    await connectCalendar(userId, code);
    return back('connected');
  } catch (err) {
    logger.error({ err: String(err) }, 'Google Calendar connect failed');
    return back('error', 'Connection failed — please try again.');
  }
}
