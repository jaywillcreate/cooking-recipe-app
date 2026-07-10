/**
 * Rough shopping-basket cost estimate. NOT live prices — a heuristic that
 * guesses a typical US price per item by ingredient type, then adjusts by the
 * store's price tier. Clearly labelled as an estimate everywhere it's shown.
 */
const PROTEIN = /\b(chicken|beef|steak|short rib|ribs|salmon|shrimp|prawn|pork|bacon|lamb|fish|turkey|paneer|tofu|sausage|chorizo|duck|cod|tuna|ground)\b/i;
const PREMIUM_ITEM = /\b(scallop|lobster|crab|saffron|pine nuts|truffle|vanilla bean|aged|prosciutto)\b/i;
const SPECIALTY = /\b(burrata|parmesan|parmigiano|feta|mozzarella|gruy|mascarpone|cream cheese|goat cheese|miso|gochujang|coconut milk|olive oil|sesame oil|nuts|maple)\b/i;
const BASIC = /\b(salt|pepper|water|sugar|flour|oil|garlic|onion|herb|spice|cumin|oregano|basil|cilantro|parsley|baking|yeast|rice|pasta|noodle|egg|milk|butter|lemon|lime|tomato|carrot|celery|potato|spinach|greens)\b/i;

export function estimateItemCost(item: string): number {
  if (PREMIUM_ITEM.test(item)) return 12;
  if (PROTEIN.test(item)) return 8;
  if (SPECIALTY.test(item)) return 5;
  if (BASIC.test(item)) return 2.5;
  return 3.5;
}

/** Sum of estimated item costs — the store-agnostic baseline for the basket. */
export function estimateBasketBase(items: string[]): number {
  return items.reduce((sum, i) => sum + estimateItemCost(i), 0);
}

// Price-tier multiplier: budget stores cheaper, premium pricier.
const TIER_MULT: Record<number, number> = { 1: 0.88, 2: 1.0, 3: 1.3 };

/** Estimated basket total at a store of the given price tier. */
export function estimateBasketAt(base: number, priceTier: number): number {
  return Math.round(base * (TIER_MULT[priceTier] ?? 1));
}
