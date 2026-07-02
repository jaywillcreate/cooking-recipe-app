import { route, requireUser, json } from '@/lib/server/http';
import { generationsUsedToday } from '@/lib/server/services/usage';
import { config } from '@/lib/server/config';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const GET = route(async (req: NextRequest) => {
  const u = requireUser(req);
  const used = await generationsUsedToday(u.id);
  return json({ used, limit: config.genDailyLimit, remaining: Math.max(0, config.genDailyLimit - used) });
});
