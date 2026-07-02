import { z } from 'zod';
import { route, requireUser, readBody, json, notFound } from '@/lib/server/http';
import { query, queryOne } from '@/lib/server/db';
import { getVisibleRecipe } from '@/lib/server/services/recipes';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const POST = route(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const u = requireUser(req);
  const collectionId = z.string().uuid().parse(ctx.params.id);
  const { recipeId } = await readBody(req, z.object({ recipeId: z.string().uuid() }));

  if (!(await queryOne(`SELECT 1 FROM collections WHERE id = $1 AND user_id = $2`, [collectionId, u.id]))) throw notFound('Collection not found');
  if (!(await getVisibleRecipe(u.id, recipeId))) throw notFound('Recipe not found');

  const exists = await queryOne(`SELECT 1 FROM collection_items WHERE collection_id = $1 AND recipe_id = $2`, [collectionId, recipeId]);
  if (exists) {
    await query(`DELETE FROM collection_items WHERE collection_id = $1 AND recipe_id = $2`, [collectionId, recipeId]);
    return json({ inCollection: false });
  }
  await query(`INSERT INTO collection_items (collection_id, recipe_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [collectionId, recipeId]);
  return json({ inCollection: true });
});
