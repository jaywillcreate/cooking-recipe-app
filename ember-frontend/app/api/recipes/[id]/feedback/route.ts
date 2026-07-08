import { z } from 'zod';
import { route, requireUser, readBody, json, notFound } from '@/lib/server/http';
import { query } from '@/lib/server/db';
import { getVisibleRecipe } from '@/lib/server/services/recipes';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

// vote: 1 = thumbs up, -1 = thumbs down, 0 = clear
const schema = z.object({ vote: z.union([z.literal(1), z.literal(-1), z.literal(0)]) });

export const POST = route(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const u = requireUser(req);
  const recipeId = z.string().uuid().parse(ctx.params.id);
  if (!(await getVisibleRecipe(u.id, recipeId))) throw notFound('Recipe not found');
  const { vote } = await readBody(req, schema);

  if (vote === 0) {
    await query(`DELETE FROM recipe_feedback WHERE user_id = $1 AND recipe_id = $2`, [u.id, recipeId]);
  } else {
    await query(
      `INSERT INTO recipe_feedback (user_id, recipe_id, vote) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, recipe_id) DO UPDATE SET vote = EXCLUDED.vote, created_at = now()`,
      [u.id, recipeId, vote],
    );
  }
  return json({ vote });
});
