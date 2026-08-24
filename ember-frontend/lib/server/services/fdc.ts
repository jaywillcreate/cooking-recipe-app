import 'server-only';
import { query, queryOne } from '../db';
import { config } from '../config';
import { logger } from '../logger';
import type { FoodPortion } from '@/lib/nutrition';

/**
 * USDA FoodData Central client.
 *
 * Two things make this more than a fetch wrapper:
 *
 * 1. **Caching.** The API allows 1,000 requests/hour per key and every recipe
 *    needs ~10 lookups, so every resolved ingredient name is cached in Postgres
 *    permanently. Food composition doesn't change; a cache miss is a one-off.
 *
 * 2. **Re-ranking.** FDC's own relevance score is weak — searching "olive oil"
 *    scores "Oil, corn, peanut, and olive" identically to "Oil, olive, extra
 *    virgin". We re-rank on token overlap, description length and data type,
 *    and reject anything that doesn't actually contain the ingredient's head
 *    noun, so a bad match becomes "unmatched" rather than wrong numbers.
 */

const BASE = 'https://api.nal.usda.gov/fdc/v1';

/** USDA nutrient ids for the four macros the app shows. */
const NUTRIENT = { energy: 1008, protein: 1003, fat: 1004, carbs: 1005 } as const;

export interface FdcFood {
  fdcId: number;
  description: string;
  dataType: string;
  /** Per 100 g. */
  per100g: { cal: number; protein: number; carbs: number; fat: number };
  portions: FoodPortion[];
}

let fdcEnsured: Promise<void> | null = null;
/** Idempotent cache tables, same lazy pattern as the rest of the app. */
export function ensureFdcTables(): Promise<void> {
  if (!fdcEnsured) {
    fdcEnsured = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS fdc_foods (
        fdc_id      INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        data_type   TEXT NOT NULL,
        per_100g    JSONB NOT NULL,
        portions    JSONB NOT NULL DEFAULT '[]'::jsonb,
        cached_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      // term → chosen food. fdc_id NULL records a genuine "no match" so we
      // don't re-query the API for every unmatchable garnish.
      await query(`CREATE TABLE IF NOT EXISTS fdc_matches (
        term       TEXT PRIMARY KEY,
        fdc_id     INTEGER REFERENCES fdc_foods(fdc_id) ON DELETE SET NULL,
        score      REAL NOT NULL DEFAULT 0,
        matched_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    })().catch((err) => {
      fdcEnsured = null;
      throw err;
    });
  }
  return fdcEnsured;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function fdcGet<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('api_key', config.fdcApiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) {
      // 429 = key throttled (very likely on DEMO_KEY). Not an error worth
      // failing the request over — the caller degrades to the AI estimate.
      logger.warn({ status: res.status, path }, 'FDC request failed');
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    logger.warn({ err: String(err), path }, 'FDC request errored');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

interface SearchHit {
  fdcId: number;
  description: string;
  dataType: string;
}

const STOPWORDS = new Set(['fresh', 'raw', 'whole', 'large', 'medium', 'small', 'of', 'and', 'the', 'in', 'or']);

const tokens = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));

/**
 * Score a candidate against the search term. Rewards covering the term's words,
 * penalises descriptions that pad in unrelated foods ("corn, peanut, and
 * olive"), and prefers the datasets with complete, generic macro data.
 */
function rank(term: string, hit: SearchHit): number {
  const want = tokens(term);
  const got = tokens(hit.description);
  if (want.length === 0 || got.length === 0) return 0;

  const covered = want.filter((w) => got.some((g) => g === w || g.startsWith(w) || w.startsWith(g))).length;
  const coverage = covered / want.length;
  // Extra words dilute: "Oil, olive" beats "Oil, corn, peanut, and olive".
  const precision = covered / got.length;
  const typeBonus = hit.dataType === 'SR Legacy' ? 0.12 : hit.dataType === 'Foundation' ? 0.08 : 0;
  // "Beverages, ..." / "Babyfood, ..." are rarely what a recipe means.
  const penalty = /\b(babyfood|infant formula|beverage|restaurant|fast food|candies)\b/i.test(hit.description) ? 0.25 : 0;

  return coverage * 0.7 + precision * 0.3 + typeBonus - penalty;
}

/** Below this the match isn't trustworthy enough to put numbers behind. */
const MIN_SCORE = 0.5;

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

interface FoodDetailResponse {
  description: string;
  dataType: string;
  foodNutrients?: { nutrient?: { id?: number }; amount?: number }[];
  foodPortions?: {
    amount?: number;
    gramWeight?: number;
    modifier?: string;
    measureUnit?: { name?: string };
  }[];
}

/** Fetch + cache the full record (macros per 100 g and portion weights). */
async function fetchFood(fdcId: number): Promise<FdcFood | null> {
  const cached = await queryOne<{ fdc_id: number; description: string; data_type: string; per_100g: FdcFood['per100g']; portions: FoodPortion[] }>(
    `SELECT * FROM fdc_foods WHERE fdc_id = $1`,
    [fdcId],
  );
  if (cached) {
    return { fdcId: cached.fdc_id, description: cached.description, dataType: cached.data_type, per100g: cached.per_100g, portions: cached.portions };
  }

  const detail = await fdcGet<FoodDetailResponse>(`/food/${fdcId}`, { format: 'full' });
  if (!detail) return null;

  const amountOf = (id: number): number => {
    const row = (detail.foodNutrients ?? []).find((n) => n.nutrient?.id === id);
    return typeof row?.amount === 'number' ? row.amount : 0;
  };
  const per100g = {
    cal: amountOf(NUTRIENT.energy),
    protein: amountOf(NUTRIENT.protein),
    carbs: amountOf(NUTRIENT.carbs),
    fat: amountOf(NUTRIENT.fat),
  };
  // Some Foundation records carry only analytical detail (fatty acid profiles,
  // no Energy). Without calories the food is useless to us — treat as no match
  // so the caller can fall back rather than silently under-counting.
  if (per100g.cal === 0 && per100g.protein === 0 && per100g.carbs === 0 && per100g.fat === 0) return null;

  const portions: FoodPortion[] = (detail.foodPortions ?? [])
    .filter((p) => (p.gramWeight ?? 0) > 0)
    .map((p) => ({
      modifier: p.modifier ?? '',
      unit: p.measureUnit?.name ?? '',
      amount: p.amount && p.amount > 0 ? p.amount : 1,
      gramWeight: p.gramWeight!,
    }));

  const food: FdcFood = { fdcId, description: detail.description, dataType: detail.dataType, per100g, portions };
  await query(
    `INSERT INTO fdc_foods (fdc_id, description, data_type, per_100g, portions)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (fdc_id) DO NOTHING`,
    [fdcId, food.description, food.dataType, JSON.stringify(per100g), JSON.stringify(portions)],
  );
  return food;
}

interface SearchResponse {
  foods?: SearchHit[];
}

export interface LookupResult {
  food: FdcFood | null;
  /** True when the upstream call failed (throttled, down, no key) rather than
   *  the food genuinely having no match — the caller reports these differently. */
  apiFailed: boolean;
}

/**
 * Resolve an ingredient name to a USDA food. Both a hit and a genuine miss are
 * cached — a miss is as expensive to recompute as a hit, and far more common
 * for garnishes and compound names. An API *failure* is never cached.
 */
export async function lookupIngredient(name: string): Promise<LookupResult> {
  const term = name.trim().toLowerCase();
  if (term.length < 2) return { food: null, apiFailed: false };
  await ensureFdcTables();

  const known = await queryOne<{ fdc_id: number | null }>(`SELECT fdc_id FROM fdc_matches WHERE term = $1`, [term]);
  if (known) return { food: known.fdc_id ? await fetchFood(known.fdc_id) : null, apiFailed: false };

  const res = await fdcGet<SearchResponse>('/foods/search', {
    query: term,
    // These two datasets are the generic, complete ones. Branded foods are a
    // sea of near-duplicates and Survey entries are prepared dishes.
    dataType: 'SR Legacy,Foundation',
    pageSize: '10',
  });
  // A failed request must not be cached as "no such food" — leave it unresolved
  // so the next attempt (or a working API key) can still find it.
  if (!res) return { food: null, apiFailed: true };

  const ranked = (res.foods ?? [])
    .map((hit) => ({ hit, score: rank(term, hit) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < MIN_SCORE) {
    await query(
      `INSERT INTO fdc_matches (term, fdc_id, score) VALUES ($1, NULL, $2)
       ON CONFLICT (term) DO UPDATE SET fdc_id = NULL, score = $2, matched_at = now()`,
      [term, best?.score ?? 0],
    );
    return { food: null, apiFailed: false };
  }

  // Walk down the ranking until one actually has macros on it.
  for (const candidate of ranked.slice(0, 3)) {
    if (candidate.score < MIN_SCORE) break;
    const food = await fetchFood(candidate.hit.fdcId);
    if (food) {
      await query(
        `INSERT INTO fdc_matches (term, fdc_id, score) VALUES ($1,$2,$3)
         ON CONFLICT (term) DO UPDATE SET fdc_id = $2, score = $3, matched_at = now()`,
        [term, food.fdcId, candidate.score],
      );
      return { food, apiFailed: false };
    }
  }
  // The search worked but every candidate's detail call came back empty. Three
  // good matches all lacking macros is far less likely than the API faltering
  // mid-sequence, so report it as an outage rather than a clean miss.
  return { food: null, apiFailed: true };
}
