import type { MetadataRoute } from 'next';
import { listPublicRecipes, backfillPublicSlugs } from '@/lib/server/services/sharing';
import { config } from '@/lib/server/config';

// Rebuilt hourly — new shares appear without a deploy.
export const revalidate = 3600;

/** Every published recipe, plus the sign-in entry point. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: config.publicOrigin, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
  ];
  try {
    // Public rows that predate slugs (the seed catalogue) get one here.
    await backfillPublicSlugs();
    const recipes = await listPublicRecipes();
    return base.concat(
      recipes.map((r) => ({
        url: `${config.publicOrigin}/r/${r.slug}`,
        lastModified: r.updated,
        changeFrequency: 'monthly' as const,
        priority: 0.8,
      })),
    );
  } catch {
    // A sitemap that 500s is worse than a short one.
    return base;
  }
}
