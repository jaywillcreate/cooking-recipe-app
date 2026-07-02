import { z } from 'zod';
import { route, requireUser, readBody, json } from '@/lib/server/http';
import { query } from '@/lib/server/db';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const PUT = route(async (req: NextRequest) => {
  const u = requireUser(req);
  const { avatarUrl } = await readBody(req, z.object({ avatarUrl: z.string().url().max(2000).nullable() }));
  await query(`UPDATE profiles SET avatar_url = $1 WHERE user_id = $2`, [avatarUrl, u.id]);
  return json({ ok: true });
});
