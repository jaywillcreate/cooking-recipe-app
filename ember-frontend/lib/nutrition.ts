/**
 * Turning an ingredient line into grams.
 *
 * Nutrition data is published per 100 g, so every ingredient has to become a
 * weight before it can be added up. Three cases, in descending order of
 * confidence:
 *
 *   weight  "400 g tomatoes"     → exact, just convert the unit
 *   volume  "2 tbsp olive oil"   → needs a density; USDA portions give a real
 *                                  one per food, otherwise a class fallback
 *   count   "3 cloves garlic"    → needs a per-item weight; USDA portions
 *                                  usually have one ("1 clove → 3 g")
 *
 * Everything here is pure so both the calculator and the UI can reason about
 * the same numbers.
 */

/** How a gram weight was arrived at — drives the confidence the UI shows. */
export type GramBasis =
  | 'weight' // the recipe already gave a weight
  | 'portion' // matched a USDA portion for this exact food
  | 'density' // volume converted with this food's own density
  | 'fallback' // volume/count converted with a generic table
  | 'none'; // couldn't be resolved

export interface GramResult {
  grams: number;
  basis: GramBasis;
  /** Human explanation, e.g. "1 cup → 160 g (USDA portion)". */
  note: string;
}

// ---------------------------------------------------------------------------
// Unit tables
// ---------------------------------------------------------------------------

/** Direct weight conversions to grams. */
const WEIGHT_G: Record<string, number> = {
  g: 1, gram: 1, kg: 1000, kilogram: 1000, oz: 28.3495, ounce: 28.3495, lb: 453.592, pound: 453.592,
};

/** Volume conversions to millilitres (US measures). */
const VOLUME_ML: Record<string, number> = {
  tsp: 4.92892, teaspoon: 4.92892, tbsp: 14.7868, tablespoon: 14.7868,
  'fl oz': 29.5735, cup: 236.588, pint: 473.176, quart: 946.353,
  ml: 1, millilitre: 1, cl: 10, l: 1000, litre: 1000, liter: 1000,
};

/**
 * Density fallback (g per ml) when the food has no usable USDA portion.
 * Keyed by a regex over the ingredient name; first match wins.
 */
const DENSITY: { re: RegExp; gPerMl: number }[] = [
  { re: /\b(oil|ghee)\b/i, gPerMl: 0.918 },
  { re: /\b(honey|molasses|syrup|treacle)\b/i, gPerMl: 1.4 },
  { re: /\b(flour|cocoa|starch)\b/i, gPerMl: 0.55 },
  { re: /\b(sugar|salt)\b/i, gPerMl: 0.85 },
  { re: /\b(rice|lentil|oat|couscous|quinoa)\b/i, gPerMl: 0.8 },
  { re: /\b(butter|shortening|lard)\b/i, gPerMl: 0.911 },
  { re: /\b(cream|yogurt|yoghurt|milk|buttermilk)\b/i, gPerMl: 1.03 },
  { re: /\b(soy sauce|fish sauce|vinegar|stock|broth|juice|wine|water)\b/i, gPerMl: 1.01 },
  { re: /\b(cheese|parmesan|breadcrumb|panko|nut|almond|walnut|pecan)\b/i, gPerMl: 0.45 },
];

/** Per-item weights for countable things USDA can't always resolve. */
const ITEM_G: { re: RegExp; grams: number }[] = [
  { re: /\bgarlic\b/i, grams: 3 }, // one clove
  { re: /\b(egg)\b/i, grams: 50 },
  { re: /\b(onion|shallot)\b/i, grams: 110 },
  { re: /\b(tomato)\b/i, grams: 123 },
  { re: /\b(potato|sweet potato)\b/i, grams: 173 },
  { re: /\b(carrot)\b/i, grams: 61 },
  { re: /\b(lemon|lime)\b/i, grams: 67 },
  { re: /\b(apple|pear|orange)\b/i, grams: 180 },
  { re: /\b(banana)\b/i, grams: 118 },
  { re: /\b(avocado)\b/i, grams: 150 },
  { re: /\b(pepper|capsicum|chilli|chili|jalape)\b/i, grams: 45 },
  { re: /\b(chicken breast|breast)\b/i, grams: 174 },
  { re: /\b(chicken thigh|thigh)\b/i, grams: 110 },
  { re: /\b(can|tin)\b/i, grams: 400 },
  { re: /\b(bunch)\b/i, grams: 60 },
  { re: /\b(sprig)\b/i, grams: 2 },
  { re: /\b(slice)\b/i, grams: 25 },
  { re: /\b(stalk|stick|rib)\b/i, grams: 40 },
];

/** Countable units whose own name is the thing being counted. */
const UNIT_ITEM_G: Record<string, number> = {
  clove: 3, can: 400, tin: 400, jar: 340, bunch: 60, sprig: 2, slice: 25,
  head: 500, stalk: 40, stick: 113, rib: 40, sheet: 40, bulb: 60, wedge: 30,
  leaf: 1, ear: 90, strip: 20, fillet: 140, breast: 174, thigh: 110,
  package: 300, packet: 300, bag: 400, box: 400, piece: 50,
  pinch: 0.35, dash: 0.6, handful: 30, knob: 15,
};

/** Things that add no meaningful energy — excluded without hurting confidence. */
const NEGLIGIBLE = /\b(salt|pepper|water|ice|to taste|to serve|to finish|for (serving|garnish)|garnish|seasoning)\b/i;

export const isNegligible = (name: string): boolean => NEGLIGIBLE.test(name);

// ---------------------------------------------------------------------------
// USDA portions
// ---------------------------------------------------------------------------

/** A USDA food portion, trimmed to what the conversion needs. */
export interface FoodPortion {
  /** Free text like "cup, chopped" or "medium (2-1/2\" dia)". */
  modifier: string;
  /** Unit name when USDA gives one ("milliliter", "cup", often "undetermined"). */
  unit: string;
  amount: number;
  gramWeight: number;
}

/** Grams per millilitre implied by a portion expressed in ml, if any. */
function densityFromPortions(portions: FoodPortion[]): number | null {
  for (const p of portions) {
    const ml = VOLUME_ML[p.unit.toLowerCase()] ?? (/(milliliter|millilitre|ml)/i.test(p.unit) ? 1 : null);
    if (ml && p.amount > 0 && p.gramWeight > 0) return p.gramWeight / (p.amount * ml);
    // Some foods only express volume in the modifier: "1 cup" → 240 g.
    const m = p.modifier.match(/^(\d+(?:\.\d+)?)?\s*(tsp|teaspoon|tbsp|tablespoon|cup|fl oz|ml|l)\b/i);
    if (m && p.gramWeight > 0) {
      const unitMl = VOLUME_ML[m[2]!.toLowerCase()];
      const count = (m[1] ? parseFloat(m[1]) : 1) * (p.amount || 1);
      if (unitMl && count > 0) return p.gramWeight / (count * unitMl);
    }
  }
  return null;
}

/**
 * Find the portion that best describes the recipe's measure. "3 cloves garlic"
 * wants the "clove" portion; "1 cup chopped onion" wants "cup, chopped"; a bare
 * "2 onions" wants "medium" (or "large", or "whole") over "cup, sliced".
 */
function matchPortion(portions: FoodPortion[], unit: string | null): FoodPortion | null {
  const wanted = unit?.toLowerCase() ?? '';
  if (wanted) {
    const direct = portions.find((p) => new RegExp(`\\b${escape(wanted)}s?\\b`, 'i').test(`${p.modifier} ${p.unit}`));
    if (direct) return direct;
    return null;
  }
  // No unit at all: the recipe is counting whole items.
  const whole = portions.find((p) => /\b(medium|whole|each|large|small)\b/i.test(p.modifier));
  return whole ?? null;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------
// The conversion
// ---------------------------------------------------------------------------

/**
 * Resolve one parsed ingredient to grams, preferring this food's own USDA
 * portions and falling back to generic tables. Returns `none` when there's no
 * quantity to work from at all.
 */
export function toGrams(
  qty: number | null,
  unit: string | null,
  name: string,
  portions: FoodPortion[] = [],
): GramResult {
  if (qty == null || qty <= 0) return { grams: 0, basis: 'none', note: 'no quantity given' };

  const u = unit?.toLowerCase() ?? null;

  // 1. Already a weight — nothing to guess.
  if (u && WEIGHT_G[u]) {
    const grams = qty * WEIGHT_G[u]!;
    return { grams, basis: 'weight', note: `${trim(qty)} ${u} → ${trim(grams)} g` };
  }

  // 2. A volume — convert to ml, then find a density.
  if (u && VOLUME_ML[u]) {
    const ml = qty * VOLUME_ML[u]!;
    const portion = matchPortion(portions, u);
    if (portion && portion.gramWeight > 0 && portion.amount > 0) {
      const grams = (qty / portion.amount) * portion.gramWeight;
      return { grams, basis: 'portion', note: `${trim(qty)} ${u} → ${trim(grams)} g (USDA "${portion.modifier || portion.unit}")` };
    }
    const density = densityFromPortions(portions);
    if (density) {
      return { grams: ml * density, basis: 'density', note: `${trim(ml)} ml × ${density.toFixed(2)} g/ml (USDA)` };
    }
    const fallback = DENSITY.find((d) => d.re.test(name))?.gPerMl ?? 1;
    return { grams: ml * fallback, basis: 'fallback', note: `${trim(ml)} ml × ${fallback.toFixed(2)} g/ml (typical)` };
  }

  // 3. A count — of a named unit ("3 cloves") or of the food itself ("2 onions").
  const portion = matchPortion(portions, u);
  if (portion && portion.gramWeight > 0 && portion.amount > 0) {
    const grams = (qty / portion.amount) * portion.gramWeight;
    return { grams, basis: 'portion', note: `${trim(qty)} × ${portion.modifier || portion.unit} → ${trim(grams)} g (USDA)` };
  }
  if (u && UNIT_ITEM_G[u] != null) {
    const grams = qty * UNIT_ITEM_G[u]!;
    return { grams, basis: 'fallback', note: `${trim(qty)} ${u} ≈ ${trim(grams)} g (typical)` };
  }
  const item = ITEM_G.find((i) => i.re.test(name));
  if (item) {
    const grams = qty * item.grams;
    return { grams, basis: 'fallback', note: `${trim(qty)} × ≈${item.grams} g each (typical)` };
  }
  // Last resort: a medium-vegetable-sized guess, flagged as such.
  return { grams: qty * 100, basis: 'fallback', note: `${trim(qty)} × ≈100 g each (assumed)` };
}

const trim = (n: number): string => (Math.round(n * 10) / 10).toString();

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

export type Confidence = 'high' | 'medium' | 'low';

/**
 * How much to trust the total.
 *
 * Weighted two ways, and the lower one wins. Calorie weighting reflects what
 * actually matters — getting the olive oil wrong dwarfs getting the parsley
 * wrong — but on its own it is blind: an unmatched ingredient contributes zero
 * calories, so it would silently cost nothing. Gram weighting catches exactly
 * that case, because a gram weight is known whether or not the food matched.
 */
export function scoreConfidence(
  rows: { calories: number; grams: number; basis: GramBasis; matched: boolean; negligible: boolean }[],
): { confidence: Confidence; matchedShare: number; matchedCount: number; total: number } {
  const counted = rows.filter((r) => !r.negligible);
  const total = counted.length;
  const matchedCount = counted.filter((r) => r.matched).length;
  if (total === 0) return { confidence: 'low', matchedShare: 0, matchedCount: 0, total: 0 };

  const quality: Record<GramBasis, number> = { weight: 1, portion: 0.95, density: 0.85, fallback: 0.6, none: 0 };

  /** Share of `pick`'s total that rests on matched foods, discounted by how the grams were derived. */
  const shareBy = (pick: (r: (typeof counted)[number]) => number): number => {
    const sum = counted.reduce((acc, r) => acc + Math.max(pick(r), 0), 0);
    if (sum <= 0) return matchedCount / total; // nothing to weigh by — fall back to a plain count
    return counted.reduce((acc, r) => acc + (r.matched ? (Math.max(pick(r), 0) / sum) * quality[r.basis] : 0), 0);
  };

  const share = Math.min(shareBy((r) => r.calories), shareBy((r) => r.grams));
  const confidence: Confidence = share >= 0.85 ? 'high' : share >= 0.6 ? 'medium' : 'low';
  return { confidence, matchedShare: share, matchedCount, total };
}
