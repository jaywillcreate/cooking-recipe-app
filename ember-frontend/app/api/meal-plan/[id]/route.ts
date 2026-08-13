import { route, requireUser, json, notFound } from '@/lib/server/http';
import { query, ensureDashboardTables } from '@/lib/server/db';
import { deleteMealEvent } from '@/lib/server/services/googleCalendar';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const DELETE = route(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const u = requireUser(req);
  await ensureDashboardTables();
  const rows = await query<{ gcal_event_id: string | null }>(
    `DELETE FROM meal_plans WHERE id = $1 AND user_id = $2 RETURNING gcal_event_id`,
    [ctx.params.id, u.id],
  );
  if (!rows.length) throw notFound('Plan entry not found');
  if (rows[0]!.gcal_event_id) await deleteMealEvent(u.id, rows[0]!.gcal_event_id);
  return json({ ok: true });
});
