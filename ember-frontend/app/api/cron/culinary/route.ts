import { route, json, unauthorized } from '@/lib/server/http';
import { config } from '@/lib/server/config';
import { refreshCulinaryGuidance } from '@/lib/server/services/culinaryAgent';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Weekly Vercel Cron target (see vercel.json): runs the culinary research agent,
 * which web-researches current cooking best practices and stores a distilled
 * guidance block that recipe generation folds into its prompts.
 */
async function handler(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!config.cronSecret || auth !== `Bearer ${config.cronSecret}`) throw unauthorized('Invalid cron secret');
  return json(await refreshCulinaryGuidance());
}

export const GET = route(handler);
export const POST = route(handler);
