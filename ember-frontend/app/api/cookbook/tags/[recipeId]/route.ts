import { z } from 'zod';
import { route, requireUser, readBody, json, notFound, badRequest } from '@/lib/server/http';
import { query } from '@/lib/server/db';
import { getVisibleRecipe } from '@/lib/server/services/recipes';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const POST = route(async (req: NextRequest, ctx: { params: { recipeId: string } }) => {
  const u = requireUser(req);
  const recipeId = z.string().uuid().parse(ctx.params.recipeId);
  if (!(await getVisibleRecipe(u.id, recipeId))) throw notFound('Recipe not found');
  const { tag } = await readBody(req, z.object({ tag: z.string().trim().min(1).max(40) }));
  const clean = tag.toLowerCase().replace(/^#/, '');
  if (!clean) throw badRequest('Empty tag');
  await query(`INSERT INTO recipe_tags (user_id, recipe_id, tag) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [u.id, recipeId, clean]);
  return json({ tag: clean }, 201);
});
