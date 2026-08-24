import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { route, requireUser, json, notFound, badRequest } from '@/lib/server/http';
import { assertRateLimit } from '@/lib/server/services/rateLimit';
import { getVisibleRecipe } from '@/lib/server/services/recipes';
import { getStoredNutrition, calculateNutrition } from '@/lib/server/services/nutritionCalc';
import { getPublicSlug } from '@/lib/server/services/sharing';
import { config } from '@/lib/server/config';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
// A cold recipe means one USDA lookup per ingredient.
export const maxDuration = 45;

type Ctx = { params: { id: string } };

/**
 * The public recipe page is ISR-cached, so a freshly calculated figure would
 * otherwise sit behind a stale render for up to an hour — on the page whose
 * whole point is showing verified numbers.
 */
async function flushPublicPage(recipeId: string): Promise<void> {
  const slug = await getPublicSlug(recipeId).catch(() => null);
  if (slug) revalidatePath(`/r/${slug}`);
}

const parseId = (raw: string): string => {
  const id = z.string().uuid().safeParse(raw);
  if (!id.success) throw badRequest('Invalid recipe id');
  return id.data;
};

/**
 * Calculated per-serving macros for a recipe, from USDA FoodData Central.
 * Returns `{ nutrition: null }` when too little matched to be worth showing —
 * the UI then keeps the model's estimate and says so.
 */
export const GET = route(async (req: NextRequest, { params }: Ctx) => {
  const u = requireUser(req);
  const id = parseId(params.id);
  const recipe = await getVisibleRecipe(u.id, id);
  if (!recipe) throw notFound('Recipe not found');

  const stored = await getStoredNutrition(id).catch(() => null);
  if (stored) return json({ nutrition: stored, configured: config.fdcConfigured });

  // Nothing stored yet, so this read has to do the ~10 upstream lookups. Cap
  // how often one account can trigger that, but degrade to the estimate rather
  // than erroring — a rate limit shouldn't break the recipe page.
  const allowed = await assertRateLimit(`nutrition-calc:${u.id}`, 60, 3600, 'Nutrition lookup limit').then(
    () => true,
    () => false,
  );
  if (!allowed) return json({ nutrition: null, reason: 'unavailable', configured: config.fdcConfigured });

  const { nutrition, reason } = await calculateNutrition(id, recipe.ingredients ?? []);
  if (nutrition) await flushPublicPage(id);
  return json({ nutrition, reason, configured: config.fdcConfigured });
});

/** Force a recalculation (ingredients edited, or a first run that was throttled). */
export const POST = route(async (req: NextRequest, { params }: Ctx) => {
  const u = requireUser(req);
  const id = parseId(params.id);
  const recipe = await getVisibleRecipe(u.id, id);
  if (!recipe) throw notFound('Recipe not found');

  // Each recalculation is ~10 upstream calls against a 1,000/hour key.
  await assertRateLimit(`nutrition:${u.id}`, 30, 3600, 'Too many nutrition recalculations — try again later');

  const { nutrition, reason } = await calculateNutrition(id, recipe.ingredients ?? []);
  if (nutrition) await flushPublicPage(id);
  return json({ nutrition, reason, configured: config.fdcConfigured });
});
