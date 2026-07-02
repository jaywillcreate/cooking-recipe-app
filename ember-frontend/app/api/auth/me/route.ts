import { route, requireUser, json } from '@/lib/server/http';
import { queryOne } from '@/lib/server/db';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const GET = route(async (req: NextRequest) => {
  const u = requireUser(req);
  const user = await queryOne(`SELECT id, email, role FROM users WHERE id = $1`, [u.id]);
  return json({ user });
});
