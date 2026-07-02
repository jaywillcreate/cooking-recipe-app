import { z } from 'zod';
import { route, requireUser, json, notFound } from '@/lib/server/http';
import { query, queryOne } from '@/lib/server/db';
import { getVisibleRecipe } from '@/lib/server/services/recipes';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

async function savedCount(userId: string): Promise<number> {
  const row = await queryOne<{ n: string }>(`SELECT count(*)::text n FROM saves WHERE user_id = $1`, [userId]);
  return row ? parseInt(row.n, 10) : 0;
}

export const POST = route(async (req: NextRequest, ctx: { params: { recipeId: string } }) => {
  const u = requireUser(req);
  const recipeId = z.string().uuid().parse(ctx.params.recipeId);
  if (!(await getVisibleRecipe(u.id, recipeId))) throw notFound('Recipe not found');
  await query(`INSERT INTO saves (user_id, recipe_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.id, recipeId]);
  return json({ saved: true, count: await savedCount(u.id) });
});

export const DELETE = route(async (req: NextRequest, ctx: { params: { recipeId: string } }) => {
  const u = requireUser(req);
  const recipeId = z.string().uuid().parse(ctx.params.recipeId);
  await query(`DELETE FROM saves WHERE user_id = $1 AND recipe_id = $2`, [u.id, recipeId]);
  return json({ saved: false, count: await savedCount(u.id) });
});
