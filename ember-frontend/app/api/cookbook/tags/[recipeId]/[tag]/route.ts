import { z } from 'zod';
import { route, requireUser, json } from '@/lib/server/http';
import { query } from '@/lib/server/db';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const DELETE = route(async (req: NextRequest, ctx: { params: { recipeId: string; tag: string } }) => {
  const u = requireUser(req);
  const recipeId = z.string().uuid().parse(ctx.params.recipeId);
  const tag = decodeURIComponent(ctx.params.tag).toLowerCase();
  await query(`DELETE FROM recipe_tags WHERE user_id = $1 AND recipe_id = $2 AND tag = $3`, [u.id, recipeId, tag]);
  return json({ ok: true });
});
