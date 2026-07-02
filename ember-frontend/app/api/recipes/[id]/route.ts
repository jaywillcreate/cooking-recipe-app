import { z } from 'zod';
import { route, requireUser, json, notFound } from '@/lib/server/http';
import { serializeRecipeForUser } from '@/lib/server/services/recipes';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const GET = route(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const u = requireUser(req);
  const id = z.string().uuid().safeParse(ctx.params.id);
  if (!id.success) throw notFound('Recipe not found');
  const recipe = await serializeRecipeForUser(u.id, id.data);
  if (!recipe) throw notFound('Recipe not found');
  return json({ recipe });
});
