import { z } from 'zod';
import { route, requireUser, readBody, json, HttpError } from '@/lib/server/http';
import { queryOne } from '@/lib/server/db';
import { assertUnderDailyLimit, generationsUsedToday } from '@/lib/server/services/usage';
import { assertRateLimit } from '@/lib/server/services/rateLimit';
import { editRecipe, type ProfileForPrompt } from '@/lib/server/services/ai';
import { buildPreferenceHints, combineAllergies } from '@/lib/server/services/personalization';
import { insertGeneratedRecipe, serializeRecipe } from '@/lib/server/services/recipes';
import { config } from '@/lib/server/config';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({
  recipeText: z.string().min(10, 'Paste a recipe first.').max(6000),
  instruction: z.string().min(2, 'Describe the change you want.').max(400),
  save: z.boolean().default(false),
});

/** Upload/paste a recipe + an instruction → AI returns a revised recipe. */
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
  const b = await readBody(req, schema);

  let revised;
  try {
    revised = await editRecipe({
      userId: u.id,
      profile,
      hints: await buildPreferenceHints(u.id),
      recipeText: b.recipeText,
      instruction: b.instruction,
    });
  } catch {
    throw new HttpError(502, 'Could not revise that recipe — give it another try.', 'generation_failed');
  }

  const row = await insertGeneratedRecipe(u.id, 'ai', revised);
  if (b.save) await queryOne(`INSERT INTO saves (user_id, recipe_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING 1`, [u.id, row.id]);
  return json({ recipe: serializeRecipe(row, { saved: b.save }), usage: { used: await generationsUsedToday(u.id), limit: config.genDailyLimit } }, 201);
});
