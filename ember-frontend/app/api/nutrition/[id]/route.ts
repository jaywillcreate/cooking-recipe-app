import { route, requireUser, json, notFound, badRequest } from '@/lib/server/http';
import { query, ensureDashboardTables } from '@/lib/server/db';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const DELETE = route(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const u = requireUser(req);
  const id = parseInt(ctx.params.id, 10);
  if (!Number.isFinite(id)) throw badRequest('Invalid entry id');
  await ensureDashboardTables();
  const rows = await query(`DELETE FROM nutrition_logs WHERE id = $1 AND user_id = $2 RETURNING id`, [id, u.id]);
  if (!rows.length) throw notFound('Entry not found');
  return json({ ok: true });
});
