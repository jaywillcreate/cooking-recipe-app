/**
 * Ranking FoodData Central search results.
 *
 * FDC's own relevance score is not usable for this: searching "olive oil"
 * returns "Oil, corn, peanut, and olive" with exactly the same score as "Oil,
 * olive, extra virgin". Believing that ranking would silently attach the wrong
 * composition to an ingredient — the one failure mode that matters here, since
 * a wrong number wearing a confidence badge is worse than no number.
 *
 * Pure and dependency-free so the ranking can be exercised directly against
 * recorded API responses.
 */

export interface SearchHit {
  fdcId: number;
  description: string;
  dataType: string;
}

const STOPWORDS = new Set(['fresh', 'raw', 'whole', 'large', 'medium', 'small', 'of', 'and', 'the', 'in', 'or']);

export const tokens = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));

/**
 * Below this the match isn't trustworthy enough to put numbers behind. Set so
 * that a candidate matching only half the query's words ("pork ... ribs" for
 * "short rib") falls short even when nothing better is available.
 */
export const MIN_SCORE = 0.55;

const matches = (want: string, got: string): boolean => got === want || got.startsWith(want) || want.startsWith(got);

/**
 * Score a candidate against the search term.
 *
 * Four signals, because coverage alone is not enough — "Oil, corn, peanut, and
 * olive" covers every word of "olive oil" just as well as "Oil, olive, extra
 * virgin" does:
 *
 *   coverage  how much of the query the description accounts for
 *   precision how little unrelated padding it carries
 *   position  where the query's words fall — USDA writes the head noun first,
 *             so "Oil, olive, …" names olive oil while "Oil, corn, peanut, and
 *             olive" only mentions it fourth
 *   dataset   a light preference for the generic, complete datasets
 *
 * Plus two penalties: records joining several foods with "and" are blends, not
 * the ingredient; and babyfood/restaurant records are rarely what a recipe
 * means. Drinks are deliberately NOT penalised — wine, stock and juice are
 * ordinary cooking ingredients that USDA files under "Beverages, …".
 */
export function rank(term: string, hit: SearchHit): number {
  const want = tokens(term);
  const got = tokens(hit.description);
  if (want.length === 0 || got.length === 0) return 0;

  const found = want.map((w) => got.findIndex((g) => matches(w, g))).filter((i) => i >= 0);
  const coverage = found.length / want.length;
  const precision = found.length / got.length;

  // Mean position of the matched words, normalised by description length: 1
  // when they lead the description, falling away as they drift to the back.
  const meanPos = found.length ? found.reduce((a, b) => a + b, 0) / found.length : got.length;
  const position = found.length ? 1 / (1 + meanPos / got.length) : 0;

  const typeBonus = hit.dataType === 'SR Legacy' ? 0.06 : hit.dataType === 'Foundation' ? 0.05 : 0;
  const blend = /\band\b/i.test(hit.description) ? 0.15 : 0;
  const junk = /\b(babyfood|infant formula|restaurant|fast food|candies)\b/i.test(hit.description) ? 0.25 : 0;

  return coverage * 0.55 + precision * 0.2 + position * 0.25 + typeBonus - blend - junk;
}

/** Candidates best-first, with their scores. */
export function rankAll(term: string, hits: SearchHit[]): { hit: SearchHit; score: number }[] {
  return hits.map((hit) => ({ hit, score: rank(term, hit) })).sort((a, b) => b.score - a.score);
}
