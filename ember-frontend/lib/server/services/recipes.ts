import 'server-only';
import { query, queryOne } from '../db';
import { CUISINE_ACCENTS, type GeneratedRecipe } from '../recipeSchema';

export interface RecipeRow {
  id: string;
  owner_id: string | null;
  origin: string;
  title: string;
  cuisine: string;
  mins: number;
  time_label: string;
  difficulty: string;
  rating: string | null;
  reviews: number;
  description: string;
  tags: string[];
  ingredients: string[];
  steps: string[];
  nutrition: Record<string, unknown>;
  source: string | null;
  photo_url: string | null;
}

export function serializeRecipe(
  r: RecipeRow,
  opts: { saved?: boolean; customTags?: string[]; userPhoto?: string | null } = {},
): Record<string, unknown> {
  const accent = CUISINE_ACCENTS[r.cuisine] ?? '#c4552d';
  const baseTags = r.tags ?? [];
  const extra = (opts.customTags ?? []).filter((t) => !baseTags.includes(t));
  const rating = r.rating != null ? String(r.rating) : null;
  const photo = opts.userPhoto ?? r.photo_url;
  return {
    id: r.id,
    origin: r.origin,
    custom: r.origin === 'ai' || r.origin === 'daily',
    title: r.title,
    cuisine: r.cuisine,
    mins: r.mins,
    time: r.time_label,
    difficulty: r.difficulty,
    rating,
    reviews: r.reviews,
    desc: r.description,
    tags: baseTags.concat(extra),
    ingredients: r.ingredients ?? [],
    steps: r.steps ?? [],
    nutrition: r.nutrition ?? {},
    source: r.source,
    photo,
    accent,
    meta: `${r.time_label} · ${r.difficulty}${rating ? ' · ★ ' + rating : ''}`,
    sourceLabel: r.source ? 'web' : r.origin === 'ai' || r.origin === 'daily' ? '✦ yours' : '',
    saved: opts.saved ?? false,
  };
}

export async function insertGeneratedRecipe(
  ownerId: string,
  origin: 'ai' | 'web' | 'daily',
  g: GeneratedRecipe,
  source?: string,
): Promise<RecipeRow> {
  const time = g.time || `${g.mins} min`;
  const row = await queryOne<RecipeRow>(
    `INSERT INTO recipes
       (owner_id, origin, title, cuisine, mins, time_label, difficulty, rating,
        reviews, description, tags, ingredients, steps, nutrition, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,0,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [ownerId, origin, g.title, g.cuisine, g.mins, time, g.difficulty, g.desc, g.tags, g.ingredients, g.steps, JSON.stringify(g.nutrition), source ?? null],
  );
  return row!;
}

export async function getVisibleRecipe(userId: string, recipeId: string): Promise<RecipeRow | null> {
  return queryOne<RecipeRow>(`SELECT * FROM recipes WHERE id = $1 AND (owner_id IS NULL OR owner_id = $2)`, [recipeId, userId]);
}

export async function customTagsFor(userId: string, recipeId: string): Promise<string[]> {
  const rows = await query<{ tag: string }>(`SELECT tag FROM recipe_tags WHERE user_id = $1 AND recipe_id = $2 ORDER BY tag`, [userId, recipeId]);
  return rows.map((r) => r.tag);
}

/** Load a visible recipe and serialize it fully (saved, tags, per-user photo). */
export async function serializeRecipeForUser(userId: string, recipeId: string): Promise<Record<string, unknown> | null> {
  const row = await getVisibleRecipe(userId, recipeId);
  if (!row) return null;
  const [savedRow, ctags, photoRow] = await Promise.all([
    queryOne(`SELECT 1 FROM saves WHERE user_id = $1 AND recipe_id = $2`, [userId, recipeId]),
    customTagsFor(userId, recipeId),
    queryOne<{ url: string }>(`SELECT url FROM recipe_photos WHERE user_id = $1 AND recipe_id = $2`, [userId, recipeId]),
  ]);
  return serializeRecipe(row, { saved: !!savedRow, customTags: ctags, userPhoto: photoRow?.url ?? null });
}
