import { z } from 'zod';
import { route, requireUser, json } from '@/lib/server/http';
import { query } from '@/lib/server/db';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const DELETE = route(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const u = requireUser(req);
  const id = z.string().uuid().parse(ctx.params.id);
  await query(`DELETE FROM collections WHERE id = $1 AND user_id = $2`, [id, u.id]);
  return json({ ok: true });
});
