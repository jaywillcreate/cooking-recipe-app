import { z } from 'zod';
import { route, requireUser, readBody, json, HttpError } from '@/lib/server/http';
import { query, queryOne } from '@/lib/server/db';
import { assertUnderDailyLimit, generationsUsedToday } from '@/lib/server/services/usage';
import { assertRateLimit } from '@/lib/server/services/rateLimit';
import { generateRecipe, type ProfileForPrompt } from '@/lib/server/services/ai';
import { buildPreferenceHints, combineAllergies } from '@/lib/server/services/personalization';
import { insertGeneratedRecipe, serializeRecipe } from '@/lib/server/services/recipes';
import { config } from '@/lib/server/config';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // generation can take a while

const schema = z.object({
  craving: z.string().max(600).default(''),
  cuisine: z.string().max(30).default('Surprise me'),
  time: z.enum(['15 min', '30 min', '45 min', '1 hr+']).default('30 min'),
  skill: z.enum(['Beginner', 'Comfortable', 'Adventurous']).default('Comfortable'),
  onHand: z.string().max(400).default(''),
  kidFriendly: z.boolean().default(false),
  save: z.boolean().default(false),
});

export const POST = route(async (req: NextRequest) => {
  const u = requireUser(req);
  await assertRateLimit('gen:global', 60, 60, 'The kitchen is busy — try again shortly.');
  await assertUnderDailyLimit(u.id);

  const p = await queryOne<ProfileForPrompt & { allergens: string[] }>(
    `SELECT cuisines, diets, allergies, skill, goal, allergens FROM profiles WHERE user_id = $1`,
    [u.id],
  );
  const base = p ?? { cuisines: [], diets: [], allergies: '', skill: 'Comfortable', goal: 'Balanced', allergens: [] };
  const profile: ProfileForPrompt = { ...base, allergies: combineAllergies(base.allergies, base.allergens) };
  const hints = await buildPreferenceHints(u.id);
  const b = await readBody(req, schema);

  let generated;
  try {
    generated = await generateRecipe({
      kind: 'create', userId: u.id, profile, hints,
      params: { craving: b.craving || "chef's choice", cuisine: b.cuisine, timeBudget: b.time, skill: b.skill, ingredientsOnHand: b.onHand || 'anything', kidFriendly: b.kidFriendly },
    });
  } catch {
    throw new HttpError(502, 'Generation hiccuped — give it another try in a moment.', 'generation_failed');
  }

  const row = await insertGeneratedRecipe(u.id, 'ai', generated);
  if (b.save) await query(`INSERT INTO saves (user_id, recipe_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.id, row.id]);
  return json({ recipe: serializeRecipe(row, { saved: b.save }), usage: { used: await generationsUsedToday(u.id), limit: config.genDailyLimit } }, 201);
});
