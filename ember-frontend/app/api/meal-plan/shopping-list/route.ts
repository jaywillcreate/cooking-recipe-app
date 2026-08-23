import { route, requireUser, json, badRequest } from '@/lib/server/http';
import { query, queryOne, ensureDashboardTables } from '@/lib/server/db';
import { consolidate, parsePantry, AISLES } from '@/lib/ingredients';
import type { WeekListResponse } from '@/lib/api';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface PlannedRow {
  date: string;
  slot: string;
  title: string;
  ingredients: string[] | null;
  recipeId: string | null;
}

/**
 * One consolidated shopping list for a week of planned meals: every linked
 * recipe's ingredients merged, quantities summed, grouped into supermarket
 * aisles, with anything the cook keeps on hand flagged (never silently
 * dropped). Free-text meals have no ingredients, so they're reported back as
 * `unplanned` rather than ignored.
 */
export const GET = route(async (req: NextRequest) => {
  const u = requireUser(req);
  const start = req.nextUrl.searchParams.get('start') ?? '';
  const end = req.nextUrl.searchParams.get('end') ?? '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) throw badRequest('start and end must be YYYY-MM-DD');
  await ensureDashboardTables();

  const rows = await query<PlannedRow>(
    `SELECT to_char(m.plan_date, 'YYYY-MM-DD') AS "date", m.slot,
            COALESCE(NULLIF(m.title, ''), r.title, '') AS title,
            r.ingredients AS ingredients, m.recipe_id AS "recipeId"
       FROM meal_plans m LEFT JOIN recipes r ON r.id = m.recipe_id
      WHERE m.user_id = $1 AND m.plan_date BETWEEN $2 AND $3
      ORDER BY m.plan_date,
        CASE m.slot WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'snack' THEN 2 ELSE 3 END`,
    [u.id, start, end],
  );

  const profile = await queryOne<{ daily_on_hand: string }>(`SELECT daily_on_hand FROM profiles WHERE user_id = $1`, [u.id]);
  const pantry = parsePantry(profile?.daily_on_hand ?? '');

  const cooked = rows.filter((r) => r.recipeId && (r.ingredients?.length ?? 0) > 0);
  const items = consolidate(
    cooked.map((r) => ({ title: r.title, ingredients: r.ingredients ?? [] })),
    pantry,
  );

  // Group in store-walk order, keeping only the aisles that have something in
  // them. "Already on hand" is its own trailing group, not an aisle.
  const buy = items.filter((i) => !i.have);
  const groups = AISLES.map((a) => ({
    key: a.key,
    label: a.label,
    items: buy.filter((i) => i.aisle === a.key),
  })).filter((g) => g.items.length > 0);

  return json({
    start,
    end,
    groups,
    onHand: items.filter((i) => i.have),
    recipes: cooked.map((r) => ({ date: r.date, slot: r.slot, title: r.title, recipeId: r.recipeId })),
    /** Planned meals with no linked recipe — nothing to shop for, so we say so. */
    unplanned: rows.filter((r) => !r.recipeId).map((r) => ({ date: r.date, slot: r.slot, title: r.title })),
    counts: { items: buy.length, onHand: items.length - buy.length, recipes: cooked.length },
    pantryTerms: pantry,
  } satisfies WeekListResponse);
});
