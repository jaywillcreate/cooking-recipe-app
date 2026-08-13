import { route, requireUser, json } from '@/lib/server/http';
import { query, queryOne } from '@/lib/server/db';
import { serializeRecipe, type RecipeRow } from '@/lib/server/services/recipes';
import { buildPreferenceHints } from '@/lib/server/services/personalization';
import { searchWebRecipes } from '@/lib/server/services/webSources';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // live RSS fetches on a cold cache

/**
 * "Fresh from the kitchen" feed: recently created TastyEmber recipes (the
 * user's own AI/daily creations + the catalog) ranked by the cuisines and
 * tastes in their profile, plus live recipe finds pulled from around the web.
 */
export const GET = route(async (req: NextRequest) => {
  const u = requireUser(req);
  const prof = await queryOne<{ cuisines: string[] }>(`SELECT cuisines FROM profiles WHERE user_id = $1`, [u.id]);
  const cuisines = prof?.cuisines ?? [];
  const hints = await buildPreferenceHints(u.id);

  const [rows, web] = await Promise.all([
    query<RecipeRow & { saved: boolean; ctags: string[]; user_photo: string | null }>(
      `SELECT r.*,
              EXISTS (SELECT 1 FROM saves s WHERE s.user_id = $1 AND s.recipe_id = r.id) AS saved,
              COALESCE(array(SELECT tag FROM recipe_tags t WHERE t.user_id = $1 AND t.recipe_id = r.id), '{}') AS ctags,
              (SELECT url FROM recipe_photos rp WHERE rp.user_id = $1 AND rp.recipe_id = r.id) AS user_photo,
              (CASE WHEN r.cuisine = ANY($2::text[]) THEN 3 ELSE 0 END
               + CASE WHEN lower(r.cuisine) = ANY($3::text[]) THEN 1 ELSE 0 END
               - CASE WHEN lower(r.cuisine) = ANY($4::text[]) THEN 3 ELSE 0 END
               + CASE WHEN r.owner_id = $1 AND r.origin IN ('ai','daily') AND r.created_at > now() - interval '7 days' THEN 2 ELSE 0 END) AS boost
         FROM recipes r
        WHERE (r.owner_id IS NULL OR r.owner_id = $1) AND r.source IS NULL
        ORDER BY boost DESC, r.created_at DESC, r.title ASC
        LIMIT 32`,
      [u.id, cuisines, hints.liked, hints.disliked],
    ),
    // 9 = one featured (2×2) + eight compact cards, a perfectly full Fresh
    // Sparks grid at 4 columns.
    searchWebRecipes(cuisines, hints.liked, 9).catch(() => []),
  ]);

  return json({
    recipes: rows.map((r) => serializeRecipe(r, { saved: r.saved, customTags: r.ctags, userPhoto: r.user_photo })),
    web,
  });
});
