import { route, json, unauthorized } from '@/lib/server/http';
import { config } from '@/lib/server/config';
import { backfillPublicNutrition } from '@/lib/server/services/nutritionCalc';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
// 60s is the Vercel Hobby ceiling; the backfill keeps its own budget below it.
export const maxDuration = 60;

/**
 * Daily Vercel Cron target (see vercel.json): give published recipes real
 * macros. A page that search engines see should not be advertising an
 * unverified estimate, and nothing else reaches recipes nobody opens in the
 * app. Batched, so a large catalogue fills in over successive nights rather
 * than in one run against the USDA rate limit.
 */
async function handler(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!config.cronSecret || auth !== `Bearer ${config.cronSecret}`) throw unauthorized('Invalid cron secret');
  return json({ ok: true, ...(await backfillPublicNutrition()) });
}

export const GET = route(handler);
export const POST = route(handler);
