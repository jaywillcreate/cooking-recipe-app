import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { route, requireUser, json, notFound, badRequest } from '@/lib/server/http';
import { getShareState, publishRecipe, unpublishRecipe, backfillPublicSlugs } from '@/lib/server/services/sharing';
import { getStoredNutrition, calculateNutrition } from '@/lib/server/services/nutritionCalc';
import { getVisibleRecipe } from '@/lib/server/services/recipes';
import { logger } from '@/lib/server/logger';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
// Publishing also calculates nutrition, which is one USDA lookup per ingredient.
export const maxDuration = 45;

type Ctx = { params: { id: string } };

/**
 * The public page is ISR-cached, so publishing/unpublishing has to drop that
 * cache immediately — otherwise "stop sharing" would keep serving the recipe
 * to anyone with the link until the window expired.
 */
const flushPublicPage = (slug: string | null): void => {
  if (slug) revalidatePath(`/r/${slug}`);
  revalidatePath('/sitemap.xml');
};

const parseId = (raw: string): string => {
  const id = z.string().uuid().safeParse(raw);
  if (!id.success) throw badRequest('Invalid recipe id');
  return id.data;
};

/** Current share state for a recipe the caller can see. */
export const GET = route(async (req: NextRequest, { params }: Ctx) => {
  const u = requireUser(req);
  const state = await getShareState(u.id, parseId(params.id));
  if (!state) throw notFound('Recipe not found');
  return json(state);
});

/** Publish: mints the slug on first share, then returns the public URL. */
export const POST = route(async (req: NextRequest, { params }: Ctx) => {
  const u = requireUser(req);
  const id = parseId(params.id);
  const state = await publishRecipe(u.id, id);
  if (!state) throw notFound('Recipe not found');

  // The public page renders a calculation but never triggers one (a crawler
  // must not spend the USDA quota). Publishing is the moment to compute it:
  // deliberate, rate-limited by the share action itself, and it's what puts
  // real macros into the page's Recipe structured data.
  await ensurePublicNutrition(u.id, id);
  // Opportunistically give the seed catalogue its slugs too, so the sitemap
  // fills in without a separate migration step.
  void backfillPublicSlugs().catch(() => {});
  flushPublicPage(state.slug);
  return json(state);
});

/** Stop sharing — the public page 404s again (the slug is kept for re-sharing). */
/** Calculate this recipe's nutrition if it has none yet. Never fails the share. */
async function ensurePublicNutrition(userId: string, recipeId: string): Promise<void> {
  try {
    if (await getStoredNutrition(recipeId)) return;
    const recipe = await getVisibleRecipe(userId, recipeId);
    if (recipe) await calculateNutrition(recipeId, recipe.ingredients ?? []);
  } catch (err) {
    logger.warn({ err: String(err), recipeId }, 'Could not calculate nutrition on publish');
  }
}

export const DELETE = route(async (req: NextRequest, { params }: Ctx) => {
  const u = requireUser(req);
  const state = await unpublishRecipe(u.id, parseId(params.id));
  if (!state) throw notFound('Recipe not found');
  flushPublicPage(state.slug);
  return json(state);
});
