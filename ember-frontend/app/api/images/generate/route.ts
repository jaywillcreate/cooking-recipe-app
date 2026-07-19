import { z } from 'zod';
import { route, requireUser, readBody, json, notFound } from '@/lib/server/http';
import { assertRateLimit } from '@/lib/server/services/rateLimit';
import { getVisibleRecipe } from '@/lib/server/services/recipes';
import {
  peekCachedImage,
  resolveGeneratedImage,
  resolveStepImage,
  getImageRevision,
  bumpImageRevision,
  recordImageFeedback,
  buildCorrection,
  getGlobalStepCorrection,
} from '@/lib/server/services/images';
import { config } from '@/lib/server/config';
import { recipeImagePrompt, stepImagePrompt, pollinationsUrl, hashId } from '@/lib/tokens';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 45; // Gemini generation can take a while

// Bump the version suffix to invalidate cached images after a prompt change.
// Steps version is separate so improving step prompts doesn't force every hero
// image to regenerate (and steps still anchor to the v2 hero).
const CACHE_VERSION = 'v2';
const STEP_CACHE_VERSION = 'v3';
// Cap feedback-driven regenerations per image so spend stays bounded.
const MAX_REVISIONS = 4;

const schema = z.object({
  recipeId: z.string().uuid(),
  stepIndex: z.number().int().min(0).max(49).optional(),
  // Feedback-driven regeneration of a step image.
  regenerate: z.boolean().optional(),
  feedback: z
    .object({
      tags: z.array(z.string().max(40)).max(8).optional(),
      note: z.string().max(500).optional(),
    })
    .optional(),
});

/**
 * Resolve a durable image URL for a recipe's hero dish or a single method step.
 * For steps, `regenerate` produces an improved image from user feedback: the
 * correction is stored and applied to a new revision, so the fix persists.
 * Always returns a usable `url` pointing at a cached Vercel Blob image.
 */
export const POST = route(async (req: NextRequest) => {
  const u = requireUser(req);
  await assertRateLimit(`img:burst:${u.id}`, 90, 60, 'Too many image requests — try again shortly.');

  const { recipeId, stepIndex, regenerate, feedback } = await readBody(req, schema);
  const recipe = await getVisibleRecipe(u.id, recipeId);
  if (!recipe) throw notFound('Recipe not found');

  const anchorPrompt = recipeImagePrompt(recipe.title, recipe.cuisine);
  const anchorCacheKey = `recipe:${recipeId}:${CACHE_VERSION}`;

  // ── Recipe hero ────────────────────────────────────────────────────────────
  if (stepIndex === undefined) {
    if (recipe.photo_url) return json({ url: recipe.photo_url, provider: 'user' });
    const cached = await peekCachedImage(anchorCacheKey);
    if (cached) return json({ url: cached, provider: 'gemini' });
    if (config.geminiEnabled) {
      await assertRateLimit(`img:day:${u.id}`, config.geminiImageDailyLimit, 86_400, 'Daily image-generation limit reached.');
    }
    const url = await resolveGeneratedImage(anchorCacheKey, anchorPrompt, { width: 600, height: 400 });
    return json(url ? { url, provider: 'gemini' } : { url: `/api/img/recipe/${recipeId}`, provider: 'pollinations' });
  }

  // ── Method step (supports feedback-driven regeneration) ─────────────────────
  const stepText = recipe.steps?.[stepIndex];
  if (!stepText) throw notFound('Step not found');

  const baseKey = `step:${recipeId}:${stepIndex}:${STEP_CACHE_VERSION}`;
  const basePrompt = stepImagePrompt(recipe.cuisine, stepText, recipe.title);

  // Fold recurring site-wide feedback into every step generation, and into the
  // cache key so a shift in the dominant issue regenerates images with the fix.
  const global = await getGlobalStepCorrection();
  const groundedBase = global.text ? `${basePrompt} ${global.text}` : basePrompt;
  const sigPart = global.sig ? `:g${global.sig}` : '';

  let { rev, correction } = await getImageRevision(baseKey);

  if (regenerate) {
    // Serve the current best once the revision cap is hit, rather than spend more.
    if (rev >= MAX_REVISIONS) {
      const eff = `${baseKey}${sigPart}${rev > 0 ? `#r${rev}` : ''}`;
      const cur = await peekCachedImage(eff);
      return json({ url: cur ?? pollinationsUrl(groundedBase, 512, 340, hashId(eff)), provider: 'gemini', rev, capped: true });
    }
    correction = buildCorrection(feedback?.tags ?? [], feedback?.note, correction);
    rev += 1;
    await bumpImageRevision(baseKey, rev, correction);
    await recordImageFeedback({ baseKey, recipeId, stepIndex, userId: u.id, vote: -1, tags: feedback?.tags ?? [], note: feedback?.note ?? null });
  }

  const effectiveKey = `${baseKey}${sigPart}${rev > 0 ? `#r${rev}` : ''}`;
  const stepPrompt =
    rev > 0 && correction
      ? `${groundedBase}\n\nCORRECTIONS FROM USER FEEDBACK — fix these specific problems and keep everything else consistent: ${correction}.`
      : groundedBase;

  // Normal load: serve the cache. Regeneration always generates the new revision.
  if (!regenerate) {
    const cached = await peekCachedImage(effectiveKey);
    if (cached) return json({ url: cached, provider: 'gemini', rev });
  }

  if (config.geminiEnabled) {
    await assertRateLimit(`img:day:${u.id}`, config.geminiImageDailyLimit, 86_400, 'Daily image-generation limit reached.');
  }
  const url = await resolveStepImage({ cacheKey: effectiveKey, stepPrompt, anchorCacheKey, anchorPrompt });
  return json(
    url
      ? { url, provider: 'gemini', rev }
      : { url: pollinationsUrl(groundedBase, 512, 340, hashId(effectiveKey)), provider: 'pollinations', rev },
  );
});
