import { route, requireUser, json } from '@/lib/server/http';
import { query } from '@/lib/server/db';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const DELETE = route(async (req: NextRequest, ctx: { params: { domain: string } }) => {
  const u = requireUser(req);
  const domain = decodeURIComponent(ctx.params.domain).toLowerCase();
  await query(`DELETE FROM followed_sites WHERE user_id = $1 AND domain = $2`, [u.id, domain]);
  return json({ ok: true });
});
