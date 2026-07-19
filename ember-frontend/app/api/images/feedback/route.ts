import { z } from 'zod';
import { route, requireUser, readBody, json, notFound } from '@/lib/server/http';
import { assertRateLimit } from '@/lib/server/services/rateLimit';
import { getVisibleRecipe } from '@/lib/server/services/recipes';
import { recordImageFeedback } from '@/lib/server/services/images';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const STEP_CACHE_VERSION = 'v3';

const schema = z.object({
  recipeId: z.string().uuid(),
  stepIndex: z.number().int().min(0).max(49),
  vote: z.union([z.literal(1), z.literal(-1)]),
  tags: z.array(z.string().max(40)).max(8).optional(),
  note: z.string().max(500).optional(),
});

/**
 * Record 👍/👎 feedback on a method-step image. This captures the signal (and,
 * for 👎, the specific issues) so the visual guide can be improved. Actual
 * regeneration is handled by /api/images/generate with `regenerate: true`.
 */
export const POST = route(async (req: NextRequest) => {
  const u = requireUser(req);
  await assertRateLimit(`imgfb:${u.id}`, 120, 60, 'Too much feedback too fast — try again shortly.');

  const { recipeId, stepIndex, vote, tags, note } = await readBody(req, schema);
  const recipe = await getVisibleRecipe(u.id, recipeId);
  if (!recipe) throw notFound('Recipe not found');
  if (!recipe.steps?.[stepIndex]) throw notFound('Step not found');

  await recordImageFeedback({
    baseKey: `step:${recipeId}:${stepIndex}:${STEP_CACHE_VERSION}`,
    recipeId,
    stepIndex,
    userId: u.id,
    vote,
    tags,
    note,
  });
  return json({ ok: true });
});
