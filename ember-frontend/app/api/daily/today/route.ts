import { route, requireUser, json } from '@/lib/server/http';
import { queryOne } from '@/lib/server/db';
import { serializeRecipeForUser } from '@/lib/server/services/recipes';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const GET = route(async (req: NextRequest) => {
  const u = requireUser(req);
  const row = await queryOne<{ recipe_id: string; for_date: string; emailed_at: string | null }>(
    `SELECT d.recipe_id, d.for_date, d.emailed_at
       FROM daily_recipes d JOIN profiles p ON p.user_id = d.user_id
      WHERE d.user_id = $1 AND d.for_date = (now() AT TIME ZONE p.timezone)::date`,
    [u.id],
  );
  if (!row) return json({ daily: null });
  const recipe = await serializeRecipeForUser(u.id, row.recipe_id);
  return json({ daily: recipe ? { ...recipe, date: row.for_date, emailedAt: row.emailed_at } : null });
});
