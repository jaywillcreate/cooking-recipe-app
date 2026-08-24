/**
 * Ingredient parsing + consolidation for the week shopping list.
 *
 * Recipe ingredients are free-text lines ("2 tbsp olive oil", "3 cloves garlic,
 * minced"). To roll a week of recipes into ONE list we have to: pull the
 * quantity and unit off each line, normalise the ingredient name so the same
 * thing written two ways merges, sum quantities within a compatible unit
 * family, and drop each item into a supermarket section so the list reads in
 * store-walk order.
 *
 * Pure and dependency-free (no `server-only`) so the API route and the UI can
 * both use it.
 */
import { formatQty } from './tokens';

export type AisleKey = 'produce' | 'bakery' | 'meat' | 'dairy' | 'pantry' | 'spice' | 'frozen' | 'drinks' | 'other';

/** Supermarket sections in the order you actually walk them; cold things last. */
export const AISLES: { key: AisleKey; label: string }[] = [
  { key: 'produce', label: 'Produce' },
  { key: 'bakery', label: 'Bakery' },
  { key: 'meat', label: 'Meat & seafood' },
  { key: 'dairy', label: 'Dairy & eggs' },
  { key: 'pantry', label: 'Pantry & dry goods' },
  { key: 'spice', label: 'Herbs & spices' },
  { key: 'frozen', label: 'Frozen' },
  { key: 'drinks', label: 'Drinks' },
  { key: 'other', label: 'Everything else' },
];

const AISLE_LABEL = new Map(AISLES.map((a) => [a.key, a.label]));

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/**
 * A unit family groups units that can be summed together. `base` is how many
 * of the family's smallest unit one of this unit is worth.
 */
interface UnitDef {
  family: string;
  base: number;
}

const UNITS: Record<string, UnitDef> = {
  // volume, imperial — base teaspoon
  tsp: { family: 'vol-imp', base: 1 },
  teaspoon: { family: 'vol-imp', base: 1 },
  tbsp: { family: 'vol-imp', base: 3 },
  tablespoon: { family: 'vol-imp', base: 3 },
  'fl oz': { family: 'vol-imp', base: 6 },
  cup: { family: 'vol-imp', base: 48 },
  pint: { family: 'vol-imp', base: 96 },
  quart: { family: 'vol-imp', base: 192 },
  // volume, metric — base millilitre
  ml: { family: 'vol-met', base: 1 },
  millilitre: { family: 'vol-met', base: 1 },
  cl: { family: 'vol-met', base: 10 },
  l: { family: 'vol-met', base: 1000 },
  litre: { family: 'vol-met', base: 1000 },
  liter: { family: 'vol-met', base: 1000 },
  // weight, imperial — base ounce
  oz: { family: 'wt-imp', base: 1 },
  ounce: { family: 'wt-imp', base: 1 },
  lb: { family: 'wt-imp', base: 16 },
  pound: { family: 'wt-imp', base: 16 },
  // weight, metric — base gram
  g: { family: 'wt-met', base: 1 },
  gram: { family: 'wt-met', base: 1 },
  kg: { family: 'wt-met', base: 1000 },
  kilogram: { family: 'wt-met', base: 1000 },
};

/** Countable units ("3 cloves garlic") — each is its own family, never converted. */
const COUNT_UNITS = [
  'clove', 'can', 'tin', 'jar', 'bunch', 'sprig', 'slice', 'head', 'stalk', 'stick',
  'package', 'packet', 'pinch', 'handful', 'leaf', 'ear', 'strip', 'fillet', 'breast',
  'thigh', 'rib', 'sheet', 'bulb', 'wedge', 'piece', 'dash', 'knob', 'bag', 'box',
];

/** Written-out numbers that show up instead of digits ("two lemons"). */
const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, dozen: 12,
};

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

// Unit aliases → canonical key above.
const UNIT_ALIASES: Record<string, string> = {
  t: 'tsp', ts: 'tsp', tsps: 'tsp', teaspoons: 'teaspoon',
  tb: 'tbsp', tbs: 'tbsp', tbsps: 'tbsp', tablespoons: 'tablespoon',
  c: 'cup', cups: 'cup', pints: 'pint', quarts: 'quart', qt: 'quart', pt: 'pint',
  ounces: 'ounce', lbs: 'lb', pounds: 'pound', grams: 'gram', kilograms: 'kilogram',
  kgs: 'kg', ltr: 'l', liters: 'liter', litres: 'litre', millilitres: 'millilitre', mls: 'ml',
};

// ---------------------------------------------------------------------------
// Name normalisation
// ---------------------------------------------------------------------------

/** Adjectives safe to drop — they never change what you buy. */
const LEADING_NOISE = /^(fresh|freshly|ripe|good[- ]quality|quality|organic|large|medium|small|whole|raw|plain|boneless|bone[- ]in|skinless|skin[- ]on|unsalted|extra[- ]virgin)\s+/i;

/** Prep instructions that trail the ingredient name. */
const TRAILING_PREP =
  /\s*[,(]?\s*\b(finely |roughly |thinly |coarsely )?(chopped|minced|diced|sliced|grated|shredded|crushed|melted|softened|beaten|peeled|halved|quartered|torn|trimmed|rinsed|drained|cooked|julienned|cubed|zested|juiced|divided|optional|to taste|for serving|for garnish|plus more.*|at room temperature)\b\.?\s*\)?/gi;

/** Strip prep noise and plurals so "3 Cloves Garlic, minced" and "garlic" merge. */
export function normalizeName(raw: string): string {
  let s = raw.toLowerCase().trim();
  s = s.split(',')[0]!; // everything after the first comma is prep detail
  s = s.replace(/\([^)]*\)/g, ' '); // "(about 2 cups)"
  s = s.replace(TRAILING_PREP, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  while (LEADING_NOISE.test(s)) s = s.replace(LEADING_NOISE, '');
  s = s.replace(/[.;:]+$/, '').trim();
  return singularize(s);
}

/** Plurals the -ies → -y rule gets wrong ("chillies" is not "chilly"). */
const IRREGULAR_PLURALS: Record<string, string> = {
  chillies: 'chilli', chilies: 'chili', leaves: 'leaf', loaves: 'loaf',
  knives: 'knife', halves: 'half', potatoes: 'potato', tomatoes: 'tomato',
};

function singularize(s: string): string {
  const words = s.split(' ');
  const last = words[words.length - 1] ?? '';
  let sing = last;
  if (IRREGULAR_PLURALS[last]) sing = IRREGULAR_PLURALS[last]!;
  else if (/ies$/.test(last) && last.length > 4) sing = last.slice(0, -3) + 'y';
  else if (/(oes|ches|shes|sses|xes)$/.test(last)) sing = last.slice(0, -2);
  else if (/leaves$/.test(last)) sing = last.replace(/leaves$/, 'leaf');
  else if (/s$/.test(last) && !/(ss|us|is)$/.test(last)) sing = last.slice(0, -1);
  words[words.length - 1] = sing;
  return words.join(' ');
}

const titleCase = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ---------------------------------------------------------------------------
// Aisles
// ---------------------------------------------------------------------------

/**
 * First match wins, so the specific rules come before the general ones —
 * "garlic powder" has to reach the spice rule before the produce rule sees
 * "garlic".
 */
const AISLE_RULES: { aisle: AisleKey; re: RegExp }[] = [
  { aisle: 'spice', re: /\b(salt|pepper(corn)?s?|paprika|cumin|coriander|turmeric|cinnamon|nutmeg|cardamom|clove powder|chili powder|chilli powder|cayenne|oregano|thyme|rosemary|sage|bay lea|basil leaf|dried \w+|garam masala|curry powder|five.spice|za'atar|sumac|saffron|vanilla extract|extract|seasoning|spice|garlic powder|onion powder|red pepper flake|herbes)\b/i },
  { aisle: 'frozen', re: /\b(frozen|ice cream|puff pastry|filo|phyllo|edamame)\b/i },
  { aisle: 'pantry', re: /\b(canned|tinned|jarred|adobo|chipotle|tomato paste|passata|coconut milk|chickpea|black bean|refried)\b/i },
  { aisle: 'meat', re: /\b(chicken|beef|steak|short rib|pork|bacon|pancetta|prosciutto|lamb|veal|turkey|duck|sausage|chorizo|salmon|tuna|cod|halibut|shrimp|prawn|scallop|mussel|clam|crab|lobster|anchov|squid|octopus|mince|ground (beef|pork|lamb|turkey|chicken))\b/i },
  { aisle: 'dairy', re: /\b(milk|cream|butter|ghee|yogurt|yoghurt|cheese|parmesan|parmigiano|mozzarella|feta|cheddar|ricotta|mascarpone|burrata|gruy|halloumi|egg|creme fraiche|crème fraîche|buttermilk|sour cream)\b/i },
  { aisle: 'bakery', re: /\b(bread|baguette|sourdough|ciabatta|brioche|bun|roll|tortilla|pita|naan|focaccia|croissant|bagel|crouton)\b/i },
  { aisle: 'produce', re: /\b(onion|shallot|garlic|ginger|lemon|lime|orange|apple|pear|banana|berry|berries|strawberr|blueberr|raspberr|tomato|potato|carrot|celery|cucumber|pepper (bell)?|bell pepper|chili|chilli|jalape|lettuce|spinach|kale|arugula|rocket|cabbage|broccoli|cauliflower|zucchini|courgette|eggplant|aubergine|mushroom|leek|scallion|spring onion|cilantro|coriander leaf|parsley|mint|dill|chive|basil|avocado|corn|squash|pumpkin|sweet potato|beet|radish|asparagus|green bean|snap pea|pea|bok choy|herb|fruit|salad|lemongrass|shallots)\b/i },
  { aisle: 'drinks', re: /\b(wine|beer|stock|broth|juice|coffee|tea|soda|water|sake|mirin|vermouth|brandy|rum|whisk(e)?y|vodka)\b/i },
  { aisle: 'pantry', re: /\b(flour|sugar|rice|pasta|noodle|spaghetti|penne|pappardelle|tagliatelle|linguine|fettuccine|rigatoni|orzo|macaroni|ramen|udon|soba|vermicelli|farfalle|fusilli|lasagne|lasagna|lentil|bean|chickpea|quinoa|couscous|oat|breadcrumb|panko|oil|vinegar|soy sauce|fish sauce|oyster sauce|hoisin|gochujang|miso|tahini|honey|maple|syrup|molasses|mustard|ketchup|mayonnaise|coconut milk|canned|tinned|tomato paste|passata|stock cube|baking powder|baking soda|yeast|cornstarch|cornflour|chocolate|cocoa|nut|almond|walnut|pecan|cashew|pistachio|sesame|seed|raisin|date|olive|caper|anchovy paste|jam|peanut butter|tortilla chip|cracker|stock powder)\b/i },
];

export function aisleFor(name: string): AisleKey {
  for (const rule of AISLE_RULES) if (rule.re.test(name)) return rule.aisle;
  return 'other';
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export interface ParsedIngredient {
  /** Numeric quantity, or null when the line has none ("Salt and pepper"). */
  qty: number | null;
  /** Canonical unit key, a countable unit, or null for a bare count. */
  unit: string | null;
  /** Normalised, singular ingredient name used as the merge key. */
  name: string;
  raw: string;
}

/** Pull the leading quantity + unit off one ingredient line. */
export function parseIngredient(raw: string): ParsedIngredient {
  let rest = raw.trim().replace(/^[-*•]\s*/, '');
  let qty: number | null = null;

  // "1 1/2", "1/2", "1½", "½", "2.5", "2-3" (a range takes the upper bound so
  // you never come home short), or a written-out number.
  const m = rest.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*[½⅓⅔¼¾⅛⅜⅝⅞]|\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?)\s*/);
  if (m) {
    qty = parseQty(m[1]!);
    rest = rest.slice(m[0].length);
  } else {
    const word = rest.match(/^([a-z]+)\s+/i);
    const n = word && WORD_NUMBERS[word[1]!.toLowerCase()];
    // "a pinch of salt" counts; "a" before a plain noun would swallow the name.
    if (n && (word![1]!.length > 1 || /^(pinch|handful|dash|few)/i.test(rest.slice(word![0].length)))) {
      qty = n;
      rest = rest.slice(word![0].length);
    }
  }

  const unit = takeUnit(rest);
  if (unit) rest = rest.slice(unit.consumed);

  let name = normalizeName(rest);
  let unitKey = unit?.key ?? null;

  // "3 garlic cloves" puts the unit *after* the food, where takeUnit can't see
  // it. Left alone the search term becomes "garlic clove", which matches
  // nothing — USDA indexes the food, not the way it was cut.
  if (qty != null && !unitKey) {
    const words = name.split(' ');
    const last = words[words.length - 1] ?? '';
    if (words.length > 1 && COUNT_UNITS.includes(last)) {
      unitKey = last;
      name = words.slice(0, -1).join(' ');
    }
  }

  return { qty, unit: unitKey, name, raw: raw.trim() };
}

function parseQty(s: string): number | null {
  const t = s.trim();
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseInt(mixed[1]!) + parseInt(mixed[2]!) / parseInt(mixed[3]!);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return parseInt(frac[1]!) / parseInt(frac[2]!);
  const uni = t.match(/^(\d*)([½⅓⅔¼¾⅛⅜⅝⅞])$/);
  if (uni) return (uni[1] ? parseInt(uni[1]) : 0) + UNICODE_FRACTIONS[uni[2]!]!;
  const range = t.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (range) return parseFloat(range[2]!);
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** Match a unit at the start of the string, returning it and how much to drop. */
function takeUnit(s: string): { key: string; consumed: number } | null {
  const m = s.match(/^\s*(fl\.?\s?oz|[a-z]+)\.?\s*(?:of\s+)?/i);
  if (!m) return null;
  const word = m[1]!.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  const canonical = UNIT_ALIASES[word] ?? word;
  if (UNITS[canonical]) return { key: canonical, consumed: m[0].length };
  const singular = canonical.replace(/s$/, '');
  if (COUNT_UNITS.includes(singular)) return { key: singular, consumed: m[0].length };
  return null;
}

// ---------------------------------------------------------------------------
// Consolidation
// ---------------------------------------------------------------------------

export interface ConsolidatedItem {
  /** Stable key for React lists and check-off storage. */
  id: string;
  /** Display name, e.g. "Garlic". */
  name: string;
  /** Summed quantity per unit family, e.g. "1 lb · 2 cloves" — empty when unquantified. */
  quantity: string;
  /** Titles of the planned recipes that need it. */
  recipes: string[];
  aisle: AisleKey;
  aisleLabel: string;
  /** True when the item matches something the cook already keeps on hand. */
  have: boolean;
}

interface Bucket {
  name: string;
  totals: Map<string, { unit: string; amount: number }>;
  unquantified: boolean;
  recipes: Set<string>;
}

export interface ConsolidateInput {
  /** One recipe's ingredient lines. */
  ingredients: string[];
  /** Recipe title, shown as the item's provenance. */
  title: string;
}

/**
 * Merge every planned recipe's ingredients into one de-duplicated list:
 * quantities summed per unit family, items dropped into aisles, and anything
 * the cook already keeps on hand flagged rather than deleted (so they can see
 * what was excluded and override it).
 */
export function consolidate(inputs: ConsolidateInput[], pantry: string[] = []): ConsolidatedItem[] {
  const buckets = new Map<string, Bucket>();

  for (const input of inputs) {
    // Within one recipe the same ingredient can appear twice ("for the sauce"
    // / "for the marinade") — those still sum, so no per-recipe de-duping.
    for (const line of input.ingredients) {
      const p = parseIngredient(line);
      if (!p.name) continue;
      const bucket = buckets.get(p.name) ?? { name: p.name, totals: new Map(), unquantified: false, recipes: new Set<string>() };
      bucket.recipes.add(input.title);
      if (p.qty == null) {
        bucket.unquantified = true;
      } else {
        const def = p.unit ? UNITS[p.unit] : undefined;
        const family = def ? def.family : (p.unit ?? 'count');
        const amount = p.qty * (def?.base ?? 1);
        const cur = bucket.totals.get(family);
        bucket.totals.set(family, { unit: p.unit ?? '', amount: (cur?.amount ?? 0) + amount });
      }
      buckets.set(p.name, bucket);
    }
  }

  const pantryTerms = pantry.map((t) => normalizeName(t)).filter((t) => t.length > 2);

  return [...buckets.values()]
    .map((b) => {
      const aisle = aisleFor(b.name);
      return {
        id: b.name.replace(/[^a-z0-9]+/g, '-'),
        name: titleCase(b.name),
        quantity: [...b.totals.entries()].map(([family, t]) => formatAmount(family, t.unit, t.amount)).filter(Boolean).join(' · '),
        recipes: [...b.recipes],
        aisle,
        aisleLabel: AISLE_LABEL.get(aisle)!,
        have: pantryTerms.some((term) => b.name === term || b.name.includes(term) || term.includes(b.name)),
      };
    })
    .sort((a, b) => AISLES.findIndex((x) => x.key === a.aisle) - AISLES.findIndex((x) => x.key === b.aisle) || a.name.localeCompare(b.name));
}

/** Render a family total in its largest sensible unit ("24 oz" → "1½ lb"). */
function formatAmount(family: string, unit: string, amount: number): string {
  switch (family) {
    case 'vol-imp':
      if (amount >= 48) return `${formatQty(amount / 48)} cup${amount >= 96 ? 's' : ''}`;
      if (amount >= 3) return `${formatQty(amount / 3)} tbsp`;
      return `${formatQty(amount)} tsp`;
    case 'vol-met':
      return amount >= 1000 ? `${formatQty(amount / 1000)} l` : `${formatQty(amount)} ml`;
    case 'wt-imp':
      return amount >= 16 ? `${formatQty(amount / 16)} lb` : `${formatQty(amount)} oz`;
    case 'wt-met':
      return amount >= 1000 ? `${formatQty(amount / 1000)} kg` : `${formatQty(amount)} g`;
    case 'count':
      return formatQty(amount);
    default:
      // A countable unit: "3 cloves", "1 can".
      return `${formatQty(amount)} ${unit}${amount > 1 ? 's' : ''}`;
  }
}

/** Split the free-text "usually on hand" profile field into pantry terms. */
export function parsePantry(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
