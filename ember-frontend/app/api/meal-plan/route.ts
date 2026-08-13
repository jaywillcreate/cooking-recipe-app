import { z } from 'zod';
import { route, requireUser, readBody, json, badRequest } from '@/lib/server/http';
import { query, queryOne, ensureDashboardTables } from '@/lib/server/db';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SELECT_ENTRY = `
  SELECT m.id, to_char(m.plan_date, 'YYYY-MM-DD') AS "date", m.slot, m.recipe_id AS "recipeId",
         COALESCE(NULLIF(m.title, ''), r.title, '') AS "title", m.notes,
         r.nutrition AS "nutrition",
         (m.gcal_event_id IS NOT NULL) AS "synced"
    FROM meal_plans m LEFT JOIN recipes r ON r.id = m.recipe_id`;

/** Meal plan entries for a date range (inclusive) — one week by default. */
export const GET = route(async (req: NextRequest) => {
  const u = requireUser(req);
  const start = req.nextUrl.searchParams.get('start') ?? '';
  const end = req.nextUrl.searchParams.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) throw badRequest('start and end must be YYYY-MM-DD');
  await ensureDashboardTables();
  const entries = await query(
    `${SELECT_ENTRY} WHERE m.user_id = $1 AND m.plan_date BETWEEN $2 AND $3 ORDER BY m.plan_date,
       CASE m.slot WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'snack' THEN 2 ELSE 3 END`,
    [u.id, start, end],
  );
  return json({ entries });
});

const upsertSchema = z
  .object({
    date: z.string().regex(DATE_RE),
    slot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
    recipeId: z.string().uuid().nullish(),
    title: z.string().max(160).default(''),
    notes: z.string().max(500).default(''),
  })
  .refine((v) => v.recipeId || v.title.trim(), { message: 'Give the meal a title or pick a recipe' });

/** Upsert the entry for a day+slot (planning over an old entry replaces it). */
export const POST = route(async (req: NextRequest) => {
  const u = requireUser(req);
  const body = await readBody(req, upsertSchema);
  await ensureDashboardTables();
  const row = await queryOne<{ id: string }>(
    `INSERT INTO meal_plans (user_id, plan_date, slot, recipe_id, title, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, plan_date, slot)
     DO UPDATE SET recipe_id = $4, title = $5, notes = $6, gcal_event_id = NULL
     RETURNING id`,
    [u.id, body.date, body.slot, body.recipeId ?? null, body.title.trim(), body.notes.trim()],
  );
  const entry = await queryOne(`${SELECT_ENTRY} WHERE m.id = $1`, [row!.id]);
  return json({ entry }, 201);
});
