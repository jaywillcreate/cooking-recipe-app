import 'server-only';
import { query, queryOne } from '../db';

/**
 * 5-star recipe ratings. One rating per user per recipe (re-rating replaces).
 * Aggregates are computed live (recipes are low-volume) and shown only on the
 * recipe detail page. Table created lazily — no manual migration on deploy.
 */

let ensured: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!ensured) {
    ensured = query(
      `CREATE TABLE IF NOT EXISTS recipe_stars (
         user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         recipe_id  UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
         stars      SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         PRIMARY KEY (user_id, recipe_id)
       )`,
    ).then(() => undefined).catch((err) => {
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

export interface StarSummary {
  myStars: number; // 0 = not rated by this user
  starsAvg: number | null;
  starsCount: number;
}

/** Set (or replace) a user's star rating and return the fresh summary. */
export async function rateRecipe(userId: string, recipeId: string, stars: number): Promise<StarSummary> {
  await ensureTable();
  await query(
    `INSERT INTO recipe_stars (user_id, recipe_id, stars) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, recipe_id) DO UPDATE SET stars = EXCLUDED.stars, updated_at = now()`,
    [userId, recipeId, stars],
  );
  return getStarSummary(userId, recipeId);
}

/** The user's own rating + the recipe's aggregate. */
export async function getStarSummary(userId: string, recipeId: string): Promise<StarSummary> {
  try {
    await ensureTable();
    const row = await queryOne<{ mine: number | null; avg: string | null; count: number }>(
      `SELECT (SELECT stars FROM recipe_stars WHERE user_id = $1 AND recipe_id = $2)::int AS mine,
              round(avg(stars)::numeric, 1)::text AS avg,
              count(*)::int AS count
         FROM recipe_stars WHERE recipe_id = $2`,
      [userId, recipeId],
    );
    return {
      myStars: row?.mine ?? 0,
      starsAvg: row?.avg ? parseFloat(row.avg) : null,
      starsCount: row?.count ?? 0,
    };
  } catch {
    return { myStars: 0, starsAvg: null, starsCount: 0 };
  }
}
