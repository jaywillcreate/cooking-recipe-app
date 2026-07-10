import { z } from 'zod';
import { route, requireUser, readBody, json, notFound } from '@/lib/server/http';
import { assertRateLimit } from '@/lib/server/services/rateLimit';
import { getVisibleRecipe } from '@/lib/server/services/recipes';
import { peekCachedImage, resolveGeneratedImage } from '@/lib/server/services/images';
import { config } from '@/lib/server/config';
import {
  recipeImagePrompt,
  stepImagePrompt,
  pollinationsUrl,
  hashId,
} from '@/lib/tokens';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 45; // Gemini generation can take a while

// Bump the version suffix to invalidate all cached images after a prompt change.
const CACHE_VERSION = 'v1';

const schema = z.object({
  recipeId: z.string().uuid(),
  stepIndex: z.number().int().min(0).max(49).optional(),
});

/**
 * Resolve the best available image URL for a recipe's hero dish or a single
 * method step. Prefers a cached / freshly-generated Gemini "Nano Banana" image
 * (durable Blob URL); always returns a usable `url`, falling back to the
 * keyless Pollinations generator when Gemini is unconfigured, capped, or errors.
 */
export const POST = route(async (req: NextRequest) => {
  const u = requireUser(req);
  await assertRateLimit(`img:burst:${u.id}`, 90, 60, 'Too many image requests — try again shortly.');

  const { recipeId, stepIndex } = await readBody(req, schema);
  const recipe = await getVisibleRecipe(u.id, recipeId);
  if (!recipe) throw notFound('Recipe not found');

  const isStep = stepIndex !== undefined;
  const stepText = isStep ? recipe.steps?.[stepIndex] : undefined;
  if (isStep && !stepText) throw notFound('Step not found');

  const prompt = isStep ? stepImagePrompt(recipe.cuisine, stepText!) : recipeImagePrompt(recipe.title, recipe.cuisine);
  const fallback = isStep
    ? pollinationsUrl(prompt, 512, 340, hashId(`${recipeId}:${stepIndex}`))
    : pollinationsUrl(prompt, 600, 400, hashId(recipeId));

  // A user's uploaded dish photo always wins for the hero.
  if (!isStep && recipe.photo_url) return json({ url: recipe.photo_url, provider: 'user' });

  const cacheKey = isStep ? `step:${recipeId}:${stepIndex}:${CACHE_VERSION}` : `recipe:${recipeId}:${CACHE_VERSION}`;

  // Serve cache hits (and the Pollinations path) without touching the spend cap.
  const cached = await peekCachedImage(cacheKey);
  if (cached) return json({ url: cached, provider: 'gemini' });
  if (!config.geminiEnabled) return json({ url: fallback, provider: 'pollinations' });

  // Cache miss + Gemini enabled → this call may spend money; enforce the cap.
  await assertRateLimit(`img:day:${u.id}`, config.geminiImageDailyLimit, 86_400, 'Daily image-generation limit reached.');
  const url = await resolveGeneratedImage(cacheKey, prompt);
  return json(url ? { url, provider: 'gemini' } : { url: fallback, provider: 'pollinations' });
});
