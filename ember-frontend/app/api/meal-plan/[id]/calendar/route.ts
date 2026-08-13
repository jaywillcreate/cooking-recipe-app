import { route, requireUser, json, notFound, badRequest } from '@/lib/server/http';
import { query, queryOne, ensureDashboardTables } from '@/lib/server/db';
import { config } from '@/lib/server/config';
import { createMealEvent } from '@/lib/server/services/googleCalendar';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const SLOT_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

/** Push one meal-plan entry to the user's Google Calendar. */
export const POST = route(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const u = requireUser(req);
  await ensureDashboardTables();
  const entry = await queryOne<{
    id: string;
    date: string;
    slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    recipeId: string | null;
    title: string;
    notes: string;
    timezone: string;
  }>(
    `SELECT m.id, to_char(m.plan_date, 'YYYY-MM-DD') AS "date", m.slot, m.recipe_id AS "recipeId",
            COALESCE(NULLIF(m.title, ''), r.title, '') AS "title", m.notes, p.timezone
       FROM meal_plans m
       LEFT JOIN recipes r ON r.id = m.recipe_id
       JOIN profiles p ON p.user_id = m.user_id
      WHERE m.id = $1 AND m.user_id = $2`,
    [ctx.params.id, u.id],
  );
  if (!entry) throw notFound('Plan entry not found');

  const description = [
    entry.notes,
    entry.recipeId ? `Recipe: ${config.appOrigin}/recipe/${entry.recipeId}` : '',
    'Planned with TastyEmber 🍳',
  ]
    .filter(Boolean)
    .join('\n');

  const ev = await createMealEvent(u.id, {
    date: entry.date,
    slot: entry.slot,
    summary: `${SLOT_LABEL[entry.slot]}: ${entry.title}`,
    description,
    timezone: entry.timezone || 'UTC',
  });
  if (!ev) throw badRequest('Google Calendar is not connected — connect it in your profile first.');

  await query(`UPDATE meal_plans SET gcal_event_id = $1 WHERE id = $2`, [ev.eventId, entry.id]);
  return json({ synced: true, htmlLink: ev.htmlLink });
});
