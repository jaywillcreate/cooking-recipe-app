import 'server-only';
import { query, queryOne } from '../db';
import { config } from '../config';
import type { RecipeRow } from './recipes';

/**
 * Public recipe sharing. A recipe is only reachable at /r/<slug> once it has
 * been explicitly published: seed recipes (owner_id IS NULL) ship published, a
 * user's own creations stay private until they hit Share. Publishing exposes
 * the recipe itself and nothing else — saves, collections, tags, notes, plans
 * and the owner's identity never appear on the public page.
 */

/** Idempotent columns so a Vercel push works before `npm run migrate`. */
let sharingEnsured: Promise<void> | null = null;
export function ensureSharingColumns(): Promise<void> {
  if (!sharingEnsured) {
    sharingEnsured = (async () => {
      await query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE`);
      await query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS share_slug TEXT`);
      await query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ`);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_share_slug ON recipes(share_slug) WHERE share_slug IS NOT NULL`);
      // The catalogue is public by design — it's what a visitor should land on.
      await query(`UPDATE recipes SET is_public = TRUE, shared_at = COALESCE(shared_at, created_at)
                   WHERE owner_id IS NULL AND is_public = FALSE`);
    })().catch((err) => {
      sharingEnsured = null; // allow a retry on the next call
      throw err;
    });
  }
  return sharingEnsured;
}

/** URL-safe title slug; empty when the title has no usable characters. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/**
 * Readable slug that can't collide: the title plus the first block of the
 * recipe's UUID ("miso-butter-short-ribs-a1b2c3d4").
 */
function slugFor(id: string, title: string): string {
  const base = slugify(title) || 'recipe';
  return `${base}-${id.slice(0, 8)}`;
}

export const shareUrl = (slug: string): string => `${config.publicOrigin}/r/${slug}`;

export interface ShareState {
  isPublic: boolean;
  slug: string | null;
  url: string | null;
}

/** Current share state — used to render the Share control on the detail page. */
export async function getShareState(userId: string, recipeId: string): Promise<ShareState | null> {
  await ensureSharingColumns();
  const row = await queryOne<{ is_public: boolean; share_slug: string | null }>(
    `SELECT is_public, share_slug FROM recipes WHERE id = $1 AND (owner_id IS NULL OR owner_id = $2)`,
    [recipeId, userId],
  );
  if (!row) return null;
  return { isPublic: row.is_public, slug: row.share_slug, url: row.share_slug ? shareUrl(row.share_slug) : null };
}

/**
 * Publish a recipe and mint its slug (kept on unpublish/republish so a link
 * that was already shared keeps working). Only the owner can publish their own
 * creation; seed recipes are shareable by anyone since they're already public.
 */
export async function publishRecipe(userId: string, recipeId: string): Promise<ShareState | null> {
  await ensureSharingColumns();
  const row = await queryOne<{ id: string; title: string; share_slug: string | null }>(
    `SELECT id, title, share_slug FROM recipes WHERE id = $1 AND (owner_id IS NULL OR owner_id = $2)`,
    [recipeId, userId],
  );
  if (!row) return null;
  const slug = row.share_slug ?? slugFor(row.id, row.title);
  await query(
    `UPDATE recipes SET is_public = TRUE, share_slug = $2, shared_at = COALESCE(shared_at, now()) WHERE id = $1`,
    [recipeId, slug],
  );
  return { isPublic: true, slug, url: shareUrl(slug) };
}

/** Unpublish — the page 404s again. Seed recipes stay public. */
export async function unpublishRecipe(userId: string, recipeId: string): Promise<ShareState | null> {
  await ensureSharingColumns();
  const row = await queryOne<{ owner_id: string | null; share_slug: string | null }>(
    `SELECT owner_id, share_slug FROM recipes WHERE id = $1 AND (owner_id IS NULL OR owner_id = $2)`,
    [recipeId, userId],
  );
  if (!row) return null;
  if (row.owner_id === null) return { isPublic: true, slug: row.share_slug, url: row.share_slug ? shareUrl(row.share_slug) : null };
  await query(`UPDATE recipes SET is_public = FALSE WHERE id = $1`, [recipeId]);
  return { isPublic: false, slug: row.share_slug, url: row.share_slug ? shareUrl(row.share_slug) : null };
}

export interface PublicRecipe extends RecipeRow {
  share_slug: string;
  shared_at: string | null;
  stars_avg: number | null;
  stars_count: number;
}

/** Fetch a published recipe by slug. Returns null when it isn't (or is no longer) public. */
export async function getPublicRecipe(slug: string): Promise<PublicRecipe | null> {
  await ensureSharingColumns();
  return queryOne<PublicRecipe>(
    `SELECT r.*,
            (SELECT ROUND(AVG(s.stars)::numeric, 1) FROM recipe_stars s WHERE s.recipe_id = r.id) AS stars_avg,
            (SELECT COUNT(*)::int FROM recipe_stars s WHERE s.recipe_id = r.id) AS stars_count
       FROM recipes r
      WHERE r.share_slug = $1 AND r.is_public = TRUE`,
    [slug],
  );
}

/** Published recipes for the sitemap, newest first. */
export async function listPublicRecipes(limit = 5000): Promise<{ slug: string; updated: Date }[]> {
  await ensureSharingColumns();
  const rows = await query<{ share_slug: string; shared_at: Date | null; created_at: Date }>(
    `SELECT share_slug, shared_at, created_at FROM recipes
      WHERE is_public = TRUE AND share_slug IS NOT NULL
      ORDER BY COALESCE(shared_at, created_at) DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ slug: r.share_slug, updated: r.shared_at ?? r.created_at }));
}

/**
 * Backfill slugs for already-public rows (the seed catalogue). Cheap and
 * idempotent: only touches rows that still have no slug.
 */
export async function backfillPublicSlugs(): Promise<number> {
  await ensureSharingColumns();
  const rows = await query<{ id: string; title: string }>(
    `SELECT id, title FROM recipes WHERE is_public = TRUE AND share_slug IS NULL LIMIT 500`,
  );
  for (const r of rows) {
    await query(`UPDATE recipes SET share_slug = $2 WHERE id = $1 AND share_slug IS NULL`, [r.id, slugFor(r.id, r.title)]);
  }
  return rows.length;
}
