import { z } from 'zod';
import { route, requireUser, readBody, json, notFound } from '@/lib/server/http';
import { assertRateLimit } from '@/lib/server/services/rateLimit';
import { getVisibleRecipe } from '@/lib/server/services/recipes';
import { rateRecipe } from '@/lib/server/services/ratings';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const schema = z.object({ stars: z.number().int().min(1).max(5) });

/** Set the caller's 1–5 star rating for a recipe; returns the fresh aggregate. */
export const POST = route(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const u = requireUser(req);
  await assertRateLimit(`rate:${u.id}`, 60, 60, 'Too many ratings — slow down a moment.');
  const id = z.string().uuid().safeParse(ctx.params.id);
  if (!id.success) throw notFound('Recipe not found');
  if (!(await getVisibleRecipe(u.id, id.data))) throw notFound('Recipe not found');
  const { stars } = await readBody(req, schema);
  return json(await rateRecipe(u.id, id.data, stars));
});
