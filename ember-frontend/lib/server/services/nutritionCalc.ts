import 'server-only';
import { query, queryOne } from '../db';
import { logger } from '../logger';
import { lookupIngredient, ensureFdcTables } from './fdc';
import { parseIngredient } from '@/lib/ingredients';
import { toGrams, isNegligible, scoreConfidence, type Confidence, type GramBasis } from '@/lib/nutrition';
import { BASE_SERVINGS } from '@/lib/tokens';

/**
 * Calculated recipe nutrition.
 *
 * The model's per-serving macros were a guess presented as a number. This
 * computes them instead: parse each ingredient line, resolve it to a USDA food,
 * convert its quantity to grams, apply that food's per-100 g composition, sum,
 * divide by servings — and report how much of the result actually rests on
 * matched data, so a thin match reads as a thin match rather than a fact.
 */

/** What one ingredient contributed, and how sure we are of it. */
export interface IngredientBreakdown {
  line: string;
  /** Name the ingredient was looked up under. */
  term: string;
  /** USDA description of the matched food, null when nothing matched. */
  matchedTo: string | null;
  fdcId: number | null;
  grams: number;
  basis: GramBasis;
  note: string;
  cal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Salt, water, "to taste" — excluded without counting against confidence. */
  negligible: boolean;
}

/** Why a calculation produced nothing — the UI says something different for each. */
export type NutritionGap = 'insufficient_match' | 'unavailable';

export interface NutritionResult {
  nutrition: CalculatedNutrition | null;
  /** Only set when `nutrition` is null. */
  reason?: NutritionGap;
}

export interface CalculatedNutrition {
  source: 'usda';
  servings: number;
  perServing: { cal: number; protein: number; carbs: number; fat: number };
  confidence: Confidence;
  /** Share of the recipe's energy resting on matched foods and solid conversions. */
  matchedShare: number;
  matchedCount: number;
  totalCount: number;
  breakdown: IngredientBreakdown[];
  computedAt: string;
}

let nutritionEnsured: Promise<void> | null = null;
export function ensureNutritionTable(): Promise<void> {
  if (!nutritionEnsured) {
    nutritionEnsured = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS recipe_nutrition (
        recipe_id     UUID PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
        servings      INTEGER NOT NULL,
        cal           NUMERIC(8,1) NOT NULL,
        protein       NUMERIC(8,1) NOT NULL,
        carbs         NUMERIC(8,1) NOT NULL,
        fat           NUMERIC(8,1) NOT NULL,
        confidence    TEXT NOT NULL,
        matched_share REAL NOT NULL,
        matched_count INTEGER NOT NULL,
        total_count   INTEGER NOT NULL,
        breakdown     JSONB NOT NULL,
        computed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      await query(`ALTER TABLE recipe_nutrition ADD COLUMN IF NOT EXISTS algo_version INTEGER NOT NULL DEFAULT 1`);
    })().catch((err) => {
      nutritionEnsured = null;
      throw err;
    });
  }
  return nutritionEnsured;
}

/**
 * Bump when ingredient parsing, gram conversion or match ranking changes in a
 * way that would alter results. Stored rows below this are treated as absent
 * and recalculated on next read — otherwise a fix only ever reaches recipes
 * nobody had looked at yet, and the ones people actually use stay wrong.
 */
export const ALGO_VERSION = 3;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Compute per-serving macros from the ingredient list. Returns null when too
 * little could be matched to be worth showing (the caller then keeps the
 * model's estimate, labelled as an estimate).
 */
export async function calculateNutrition(
  recipeId: string,
  ingredients: string[],
  servings = BASE_SERVINGS,
): Promise<NutritionResult> {
  await ensureFdcTables();
  const breakdown: IngredientBreakdown[] = [];
  // An upstream failure and a genuinely unmatchable ingredient both leave the
  // row unmatched, but they mean different things to the reader.
  let apiFailed = false;

  for (const line of ingredients) {
    const parsed = parseIngredient(line);
    if (!parsed.name) continue;
    const negligible = isNegligible(parsed.name) || isNegligible(line);

    // Don't spend API calls on things that contribute no energy.
    if (negligible) {
      breakdown.push({
        line, term: parsed.name, matchedTo: null, fdcId: null, grams: 0, basis: 'none',
        note: 'no meaningful calories', cal: 0, protein: 0, carbs: 0, fat: 0, negligible: true,
      });
      continue;
    }

    const { food, apiFailed: failed } = await lookupIngredient(parsed.name);
    if (failed) apiFailed = true;
    const g = toGrams(parsed.qty, parsed.unit, parsed.name, food?.portions ?? [], line);
    const factor = g.grams / 100;

    breakdown.push({
      line,
      term: parsed.name,
      matchedTo: food?.description ?? null,
      fdcId: food?.fdcId ?? null,
      grams: round1(g.grams),
      basis: g.basis,
      note: food ? g.note : 'no USDA match',
      cal: food ? round1(food.per100g.cal * factor) : 0,
      protein: food ? round1(food.per100g.protein * factor) : 0,
      carbs: food ? round1(food.per100g.carbs * factor) : 0,
      fat: food ? round1(food.per100g.fat * factor) : 0,
      negligible: false,
    });
  }

  const score = scoreConfidence(
    breakdown.map((b) => ({ calories: b.cal, grams: b.grams, basis: b.basis, matched: b.fdcId != null && b.grams > 0, negligible: b.negligible })),
  );

  // Below this the number would be more misleading than no number at all.
  if (score.total === 0 || score.matchedShare < 0.4) {
    logger.info({ recipeId, matchedShare: score.matchedShare, apiFailed }, 'Nutrition calculation too sparse — keeping estimate');
    return { nutrition: null, reason: apiFailed ? 'unavailable' : 'insufficient_match' };
  }

  const totals = breakdown.reduce(
    (acc, b) => ({ cal: acc.cal + b.cal, protein: acc.protein + b.protein, carbs: acc.carbs + b.carbs, fat: acc.fat + b.fat }),
    { cal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const perServing = {
    cal: Math.round(totals.cal / servings),
    protein: Math.round(totals.protein / servings),
    carbs: Math.round(totals.carbs / servings),
    fat: Math.round(totals.fat / servings),
  };

  const result: CalculatedNutrition = {
    source: 'usda',
    servings,
    perServing,
    confidence: score.confidence,
    matchedShare: score.matchedShare,
    matchedCount: score.matchedCount,
    totalCount: score.total,
    breakdown,
    computedAt: new Date().toISOString(),
  };

  // Only persist a clean run. If any lookup was throttled or errored, some
  // ingredients went unmatched for reasons that have nothing to do with the
  // recipe — storing that would freeze a degraded figure in place, because
  // reads never recompute once a row exists.
  if (apiFailed) {
    logger.info({ recipeId }, 'Nutrition computed during an upstream failure — returning without caching');
    return { nutrition: result };
  }

  await ensureNutritionTable();
  await query(
    `INSERT INTO recipe_nutrition
       (recipe_id, servings, cal, protein, carbs, fat, confidence, matched_share, matched_count, total_count, breakdown, computed_at, algo_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now(), $12)
     ON CONFLICT (recipe_id) DO UPDATE SET
       servings = $2, cal = $3, protein = $4, carbs = $5, fat = $6, confidence = $7,
       matched_share = $8, matched_count = $9, total_count = $10, breakdown = $11,
       computed_at = now(), algo_version = $12`,
    [recipeId, servings, perServing.cal, perServing.protein, perServing.carbs, perServing.fat,
     score.confidence, score.matchedShare, score.matchedCount, score.total, JSON.stringify(breakdown), ALGO_VERSION],
  );

  return { nutrition: result };
}

interface NutritionRow {
  servings: number;
  cal: string;
  protein: string;
  carbs: string;
  fat: string;
  confidence: string;
  matched_share: number;
  matched_count: number;
  total_count: number;
  breakdown: IngredientBreakdown[];
  computed_at: Date;
}

/** Previously calculated numbers for a recipe, if any. */
export async function getStoredNutrition(recipeId: string): Promise<CalculatedNutrition | null> {
  await ensureNutritionTable();
  // Rows from an older algorithm are treated as missing, so a parsing or
  // ranking fix reaches recipes that were already calculated.
  const row = await queryOne<NutritionRow>(
    `SELECT * FROM recipe_nutrition WHERE recipe_id = $1 AND algo_version >= $2`,
    [recipeId, ALGO_VERSION],
  );
  if (!row) return null;
  return {
    source: 'usda',
    servings: row.servings,
    perServing: {
      cal: Math.round(Number(row.cal)),
      protein: Math.round(Number(row.protein)),
      carbs: Math.round(Number(row.carbs)),
      fat: Math.round(Number(row.fat)),
    },
    confidence: row.confidence as Confidence,
    matchedShare: row.matched_share,
    matchedCount: row.matched_count,
    totalCount: row.total_count,
    breakdown: row.breakdown,
    computedAt: row.computed_at.toISOString(),
  };
}

/**
 * Calculate nutrition for published recipes that have none yet.
 *
 * The in-app view computes on demand and publishing computes on share, but
 * neither reaches recipes that were already public before those paths existed
 * — including the seed catalogue, which is exactly what search engines see.
 * Without this they would advertise the model's estimate indefinitely.
 *
 * Bounded twice over: by recipe count and by a wall-clock budget, since the
 * caller is a cron function with a hard ceiling and each recipe costs roughly
 * one USDA lookup per ingredient.
 */
export async function backfillPublicNutrition(
  limit = 15,
  budgetMs = 45_000,
): Promise<{ attempted: number; calculated: number; skipped: number }> {
  await ensureNutritionTable();
  const started = Date.now();

  const rows = await query<{ id: string; ingredients: string[] }>(
    `SELECT r.id, r.ingredients
       FROM recipes r
       LEFT JOIN recipe_nutrition n ON n.recipe_id = r.id
      WHERE r.is_public = TRUE AND (n.recipe_id IS NULL OR n.algo_version < $2)
        AND array_length(r.ingredients, 1) > 0
      ORDER BY COALESCE(r.shared_at, r.created_at) DESC
      LIMIT $1`,
    [limit, ALGO_VERSION],
  );

  let calculated = 0;
  let attempted = 0;
  for (const row of rows) {
    if (Date.now() - started > budgetMs) break;
    attempted++;
    try {
      const { nutrition } = await calculateNutrition(row.id, row.ingredients);
      if (nutrition) calculated++;
    } catch (err) {
      logger.warn({ err: String(err), recipeId: row.id }, 'Nutrition backfill failed for recipe');
    }
  }

  return { attempted, calculated, skipped: rows.length - attempted };
}
