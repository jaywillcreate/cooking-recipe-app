import { route, requireUser, json, badRequest } from '@/lib/server/http';
import { config } from '@/lib/server/config';
import { buildCalendarAuthUrl, signCalendarState } from '@/lib/server/services/googleCalendar';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Returns the Google consent URL (the client navigates to it). This is a JSON
 * endpoint rather than a redirect because the consent hop is initiated from
 * authenticated fetch — the signed `state` JWT carries the user through the
 * cookie-less redirect back.
 */
export const GET = route(async (req: NextRequest) => {
  const u = requireUser(req);
  if (!config.googleEnabled) throw badRequest('Google integration is not configured on this deployment.');
  return json({ url: buildCalendarAuthUrl(signCalendarState(u.id)) });
});
