/**
 * Culinary names that USDA files under a different word.
 *
 * FoodData Central's generic datasets index foods, not the names cooks use.
 * There is no "pappardelle" — there is "Pasta, dry, enriched", which is
 * nutritionally the same thing. Likewise a British recipe's "courgette" is
 * USDA's "zucchini", and its "double cream" is "heavy cream".
 *
 * These are not guesses at nutrition. Each entry redirects the *search* to the
 * food USDA actually holds; the composition still comes from the matched
 * record, and a redirect that finds nothing still fails honestly.
 *
 * Deliberately conservative — only mappings where the substitution is the same
 * ingredient under another name, never a rough equivalent. "Mince" is absent
 * because it could be beef, pork or lamb, and guessing would put real numbers
 * behind a coin flip.
 */

/** Pasta shapes differ in geometry, not composition. */
const PASTA_SHAPES =
  /^(pappardelle|tagliatelle|fettuccine|linguine|penne|rigatoni|fusilli|farfalle|orzo|macaroni|conchiglie|bucatini|cavatappi|ziti|vermicelli|angel hair|capellini|tagliolini|casarecce|orecchiette|paccheri|lasagne|lasagna)( sheet| noodle)?$/i;

/** Exact-name redirects, keyed by the normalised ingredient name. */
const SYNONYMS: Record<string, string> = {
  // British / American
  courgette: 'zucchini',
  aubergine: 'eggplant',
  rocket: 'arugula',
  'spring onion': 'onions, spring',
  scallion: 'onions, spring',
  coriander: 'coriander leaves',
  prawn: 'shrimp',
  'double cream': 'cream, heavy',
  'single cream': 'cream, light',
  'soured cream': 'sour cream',
  'caster sugar': 'sugars, granulated',
  'icing sugar': 'sugars, powdered',
  'plain flour': 'wheat flour, white, all-purpose',
  'self-raising flour': 'wheat flour, white, all-purpose, self-rising',
  cornflour: 'cornstarch',
  'bicarbonate of soda': 'baking soda',
  passata: 'tomato puree',
  mangetout: 'snow peas',
  'gem lettuce': 'lettuce, cos or romaine',
  rasher: 'bacon',
  'chip potato': 'potatoes',
  swede: 'rutabaga',
  beetroot: 'beets',
  'sultana': 'raisins',

  // Names USDA words differently
  'chickpea': 'chickpeas garbanzo beans',
  'garbanzo': 'chickpeas garbanzo beans',
  'spring green': 'collards',
  'natural yogurt': 'yogurt, plain',
  'greek yogurt': 'yogurt, greek, plain',
  'creme fraiche': 'sour cream',
  'crème fraîche': 'sour cream',
  'romano bean': 'beans, snap',
  'cos lettuce': 'lettuce, cos or romaine',
};

/**
 * The term to search USDA for, given a normalised ingredient name. Returns the
 * name unchanged when no redirect applies.
 */
export function usdaSearchTerm(name: string): string {
  const key = name.trim().toLowerCase();
  if (SYNONYMS[key]) return SYNONYMS[key]!;
  if (PASTA_SHAPES.test(key)) return 'pasta, dry, enriched';
  // "dried pappardelle", "fresh tagliatelle" — the shape still decides.
  const head = key.split(' ').pop() ?? '';
  if (PASTA_SHAPES.test(head)) return 'pasta, dry, enriched';
  return name;
}
