import { z } from 'zod';
import { route, requireUser, readBody, json, badRequest } from '@/lib/server/http';
import { query, queryOne } from '@/lib/server/db';
import { assertUnderDailyLimit } from '@/lib/server/services/usage';
import { assertRateLimit } from '@/lib/server/services/rateLimit';
import { normalizeDomain, fetchLatestFromSite } from '@/lib/server/services/webSources';
import { insertGeneratedRecipe, serializeRecipe } from '@/lib/server/services/recipes';
import type { ProfileForPrompt } from '@/lib/server/services/ai';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

async function profileForPrompt(userId: string): Promise<ProfileForPrompt> {
  const p = await queryOne<ProfileForPrompt>(`SELECT cuisines, diets, allergies, skill, goal FROM profiles WHERE user_id = $1`, [userId]);
  return p ?? { cuisines: [], diets: [], allergies: '', skill: 'Comfortable', goal: 'Balanced' };
}

export const GET = route(async (req: NextRequest) => {
  const u = requireUser(req);
  const rows = await query<{ domain: string }>(`SELECT domain FROM followed_sites WHERE user_id = $1 ORDER BY created_at`, [u.id]);
  return json({ sites: rows.map((r) => r.domain), detail: rows });
});

export const POST = route(async (req: NextRequest) => {
  const u = requireUser(req);
  await assertRateLimit('gen:global', 60, 60, 'The kitchen is busy — try again shortly.');
  const { domain: input } = await readBody(req, z.object({ domain: z.string().min(3).max(255) }));
  const domain = normalizeDomain(input);

  if (!(await queryOne(`SELECT 1 FROM followed_sites WHERE user_id = $1 AND domain = $2`, [u.id, domain]))) {
    await query(`INSERT INTO followed_sites (user_id, domain) VALUES ($1,$2)`, [u.id, domain]);
  }
  await assertUnderDailyLimit(u.id);
  try {
    const { recipe, via } = await fetchLatestFromSite(domain, await profileForPrompt(u.id), u.id);
    const row = await insertGeneratedRecipe(u.id, 'web', recipe, domain);
    await query(`UPDATE followed_sites SET last_fetched = now() WHERE user_id = $1 AND domain = $2`, [u.id, domain]);
    return json({ domain, via, recipe: serializeRecipe(row) }, 201);
  } catch {
    throw badRequest(`Couldn't fetch from ${domain} right now — the site was added, try again in a moment.`);
  }
});
