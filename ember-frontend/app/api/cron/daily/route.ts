import { route, json, unauthorized } from '@/lib/server/http';
import { config } from '@/lib/server/config';
import { runDailySweep } from '@/lib/server/services/daily';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
// 60s is the Vercel Hobby ceiling. On Pro you can raise this; for large user
// bases, batch the sweep across multiple cron runs instead.
export const maxDuration = 60;

/**
 * Vercel Cron target. Vercel sends `Authorization: Bearer $CRON_SECRET`; we
 * reject anything else so the endpoint can't be triggered by the public.
 * Schedule is defined in vercel.json.
 */
async function handler(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!config.cronSecret || auth !== `Bearer ${config.cronSecret}`) throw unauthorized('Invalid cron secret');
  const result = await runDailySweep();
  return json({ ok: true, ...result });
}

export const GET = route(handler);
export const POST = route(handler);
