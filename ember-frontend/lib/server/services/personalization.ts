import 'server-only';
import { query } from '../db';

export interface PreferenceHints {
  liked: string[];
  disliked: string[];
}

/**
 * Summarize a user's thumbs up/down history into cuisine/tag signals the AI can
 * use to personalize future recipes. Recent votes weighted (most recent 40).
 */
export async function buildPreferenceHints(userId: string): Promise<PreferenceHints> {
  const rows = await query<{ vote: number; cuisine: string; tags: string[] }>(
    `SELECT f.vote, r.cuisine, r.tags
       FROM recipe_feedback f JOIN recipes r ON r.id = f.recipe_id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC LIMIT 40`,
    [userId],
  );
  const liked = new Set<string>();
  const disliked = new Set<string>();
  for (const r of rows) {
    const terms = [r.cuisine, ...(r.tags || [])].filter(Boolean);
    for (const t of terms) (r.vote === 1 ? liked : disliked).add(t.toLowerCase());
  }
  // Don't mark something disliked if it's also liked.
  for (const t of liked) disliked.delete(t);
  return { liked: [...liked].slice(0, 10), disliked: [...disliked].slice(0, 10) };
}

/** Combine free-text allergies + selected allergen chips into one string. */
export function combineAllergies(allergies: string, allergens: string[]): string {
  return [allergies, ...(allergens || [])].map((s) => s.trim()).filter(Boolean).join(', ');
}
