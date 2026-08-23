import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { route, requireUser, json, notFound, badRequest } from '@/lib/server/http';
import { getShareState, publishRecipe, unpublishRecipe, backfillPublicSlugs } from '@/lib/server/services/sharing';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

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
  const state = await publishRecipe(u.id, parseId(params.id));
  if (!state) throw notFound('Recipe not found');
  // Opportunistically give the seed catalogue its slugs too, so the sitemap
  // fills in without a separate migration step.
  void backfillPublicSlugs().catch(() => {});
  flushPublicPage(state.slug);
  return json(state);
});

/** Stop sharing — the public page 404s again (the slug is kept for re-sharing). */
export const DELETE = route(async (req: NextRequest, { params }: Ctx) => {
  const u = requireUser(req);
  const state = await unpublishRecipe(u.id, parseId(params.id));
  if (!state) throw notFound('Recipe not found');
  flushPublicPage(state.slug);
  return json(state);
});
