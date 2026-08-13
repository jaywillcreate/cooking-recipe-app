import { z } from 'zod';
import { route, requireUser, readBody, json, badRequest } from '@/lib/server/http';
import { query, queryOne, ensureDashboardTables } from '@/lib/server/db';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** One day of the nutrition tracker: entries + totals vs the profile targets. */
export const GET = route(async (req: NextRequest) => {
  const u = requireUser(req);
  const date = req.nextUrl.searchParams.get('date') ?? '';
  if (!DATE_RE.test(date)) throw badRequest('date must be YYYY-MM-DD');
  await ensureDashboardTables();
  const entries = await query(
    `SELECT id, to_char(for_date, 'YYYY-MM-DD') AS "date", meal, recipe_id AS "recipeId", name, cal, protein, carbs, fat
       FROM nutrition_logs WHERE user_id = $1 AND for_date = $2 ORDER BY created_at`,
    [u.id, date],
  );
  const targets = await queryOne(
    `SELECT target_calories AS "cal", target_protein AS "protein", target_carbs AS "carbs", target_fat AS "fat"
       FROM profiles WHERE user_id = $1`,
    [u.id],
  );
  const totals = entries.reduce(
    (t, e) => ({ cal: t.cal + e.cal, protein: t.protein + e.protein, carbs: t.carbs + e.carbs, fat: t.fat + e.fat }),
    { cal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return json({ entries, totals, targets });
});

const addSchema = z.object({
  date: z.string().regex(DATE_RE),
  meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  name: z.string().min(1).max(160),
  recipeId: z.string().uuid().optional(),
  cal: z.number().int().min(0).max(20000).default(0),
  protein: z.number().int().min(0).max(2000).default(0),
  carbs: z.number().int().min(0).max(2000).default(0),
  fat: z.number().int().min(0).max(2000).default(0),
});

export const POST = route(async (req: NextRequest) => {
  const u = requireUser(req);
  const body = await readBody(req, addSchema);
  await ensureDashboardTables();

  // Logging a recipe without explicit macros: pull them from its nutrition JSON.
  let { cal, protein, carbs, fat } = body;
  if (body.recipeId && !cal && !protein && !carbs && !fat) {
    const r = await queryOne<{ nutrition: { cal?: unknown; protein?: unknown; carbs?: unknown; fat?: unknown } | null }>(
      `SELECT nutrition FROM recipes WHERE id = $1`,
      [body.recipeId],
    );
    const num = (v: unknown) => (typeof v === 'number' ? Math.round(v) : parseInt(String(v ?? ''), 10) || 0);
    if (r?.nutrition) {
      cal = num(r.nutrition.cal);
      protein = num(r.nutrition.protein);
      carbs = num(r.nutrition.carbs);
      fat = num(r.nutrition.fat);
    }
  }

  const entry = await queryOne(
    `INSERT INTO nutrition_logs (user_id, for_date, meal, recipe_id, name, cal, protein, carbs, fat)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, to_char(for_date, 'YYYY-MM-DD') AS "date", meal, recipe_id AS "recipeId", name, cal, protein, carbs, fat`,
    [u.id, body.date, body.meal, body.recipeId ?? null, body.name, cal, protein, carbs, fat],
  );
  return json({ entry }, 201);
});
