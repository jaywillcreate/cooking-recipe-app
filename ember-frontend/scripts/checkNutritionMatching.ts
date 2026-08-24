/**
 * Ranking checks for USDA ingredient matching — `npm run check:matching`.
 *
 * The failure these guard against is silent: FDC returns "Oil, corn, peanut,
 * and olive" for "olive oil" with the same relevance score as the actual olive
 * oil, so a regression here would attach the wrong composition to an
 * ingredient and still show a confidence badge over it.
 *
 * The "olive oil" and "onion" candidate sets are verbatim from live FoodData
 * Central responses. The rest are written in USDA's house style to cover cases
 * seen in production — they exercise the ranking, not the API.
 */
import { rankAll, MIN_SCORE } from '../lib/fdcRank';
import { usdaSearchTerm } from '../lib/ingredientSynonyms';

/**
 * Candidates recorded from real FoodData Central responses (see the curl
 * probes in this session) — the point is to check the ranking against data
 * the API actually returns, including the case where FDC's own score is flat.
 */
const cases: { term: string; hits: { fdcId: number; description: string; dataType: string }[]; want: number[] }[] = [
  {
    // Real: all three came back with score 502.9 from FDC itself.
    term: 'olive oil',
    hits: [
      { fdcId: 167737, description: 'Oil, corn, peanut, and olive', dataType: 'SR Legacy' },
      { fdcId: 1750351, description: 'Oil, olive, extra light', dataType: 'Foundation' },
      { fdcId: 748608, description: 'Oil, olive, extra virgin', dataType: 'Foundation' },
    ],
    want: [748608, 1750351], // both are pure olive oil — either is right; the blend is not
  },
  {
    term: 'onion',
    hits: [
      { fdcId: 170000, description: 'Onions, raw', dataType: 'SR Legacy' },
      { fdcId: 170008, description: 'Onions, sweet, raw', dataType: 'SR Legacy' },
      { fdcId: 168583, description: 'Onion rings, breaded, par fried, frozen, prepared, heated in oven', dataType: 'SR Legacy' },
    ],
    want: [170000],
  },
  {
    term: 'short rib',
    hits: [
      { fdcId: 168635, description: 'Beef, ribs, short, separable lean only, cooked, braised', dataType: 'SR Legacy' },
      { fdcId: 169000, description: 'Babyfood, meat, beef, strained', dataType: 'SR Legacy' },
      { fdcId: 171000, description: 'Pork, fresh, loin, country-style ribs', dataType: 'SR Legacy' },
    ],
    want: [168635],
  },
];

let failures = 0;
for (const c of cases) {
  const ranked = rankAll(c.term, c.hits);
  const top = ranked[0]!;
  const ok = c.want.includes(top.hit.fdcId) && top.score >= MIN_SCORE;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  "${c.term}"`);
  for (const r of ranked) console.log(`        ${r.score.toFixed(3)}  ${r.hit.description}${r.score < MIN_SCORE ? '   (below threshold — dropped)' : ''}`);
}

// Drinks are ordinary cooking ingredients. USDA files them under "Alcoholic
// beverage, …", which an over-eager junk penalty used to reject outright.
const wine = rankAll('red wine', [
  { fdcId: 173190, description: 'Alcoholic beverage, wine, table, red', dataType: 'SR Legacy' },
  { fdcId: 174844, description: 'Sauce, pasta, spaghetti/marinara, ready-to-serve', dataType: 'SR Legacy' },
]);
const winePass = wine[0]!.hit.fdcId === 173190 && wine[0]!.score >= MIN_SCORE;
console.log(`${winePass ? 'PASS' : 'FAIL'}  "red wine" matches wine (${wine[0]!.score.toFixed(3)} — "${wine[0]!.hit.description}")`);
if (!winePass) failures++;

// Nothing plausible should sneak past the threshold.
const junk = rankAll('pappardelle', [
  { fdcId: 1, description: 'Pasta, dry, enriched', dataType: 'SR Legacy' },
  { fdcId: 2, description: 'Beverages, tea, black, brewed', dataType: 'SR Legacy' },
]);
const junkPassed = junk.filter((r) => r.score >= MIN_SCORE);
console.log(`${junkPassed.length === 0 ? 'PASS' : 'FAIL'}  unredirected "pappardelle" matches nothing on words alone (best ${junk[0]!.score.toFixed(3)} — "${junk[0]!.hit.description}")`);
if (junkPassed.length) failures++;

// Search-term redirects: USDA holds the food under another name.
const redirects: [string, string][] = [
  ['pappardelle', 'pasta, dry, enriched'],
  ['orzo', 'pasta, dry, enriched'],
  ['fresh tagliatelle', 'pasta, dry, enriched'],
  ['courgette', 'zucchini'],
  ['double cream', 'cream, heavy'],
  ['onion', 'onion'], // untouched — no redirect should apply
  ['short rib', 'short rib'],
];
for (const [input, want] of redirects) {
  const got = usdaSearchTerm(input);
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  "${input}" -> "${got}"${ok ? '' : ` (wanted "${want}")`}`);
}

// A redirect must still be able to fail: pasta is a real food, but the
// redirected term has to actually beat the threshold to be used.
const pasta = rankAll(usdaSearchTerm('pappardelle'), [
  { fdcId: 168927, description: 'Pasta, dry, enriched', dataType: 'SR Legacy' },
  { fdcId: 169737, description: 'Beverages, tea, black, brewed', dataType: 'SR Legacy' },
]);
const pastaPass = pasta[0]!.hit.fdcId === 168927 && pasta[0]!.score >= MIN_SCORE;
console.log(`${pastaPass ? 'PASS' : 'FAIL'}  redirected "pappardelle" now matches pasta (${pasta[0]!.score.toFixed(3)})`);
if (!pastaPass) failures++;

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
