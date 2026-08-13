import { route, requireUser, json } from '@/lib/server/http';
import { config } from '@/lib/server/config';
import { getCalendarConnection, disconnectCalendar } from '@/lib/server/services/googleCalendar';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/** Connection status for the profile dashboard's Connections card. */
export const GET = route(async (req: NextRequest) => {
  const u = requireUser(req);
  if (!config.googleEnabled) return json({ configured: false, connected: false, email: null, connectedAt: null });
  const conn = await getCalendarConnection(u.id);
  return json({
    configured: true,
    connected: !!conn,
    email: conn?.email ?? null,
    connectedAt: conn?.connectedAt ?? null,
  });
});

export const DELETE = route(async (req: NextRequest) => {
  const u = requireUser(req);
  await disconnectCalendar(u.id);
  return json({ ok: true });
});
