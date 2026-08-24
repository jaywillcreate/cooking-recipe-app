/**
 * Ranking checks for USDA ingredient matching — `npm run check:matching`.
 *
 * These fixtures are real FoodData Central search results, kept because the
 * failure they guard against is silent: FDC returns "Oil, corn, peanut, and
 * olive" for "olive oil" with the same relevance score as the actual olive
 * oil, so a regression here would attach the wrong composition to an
 * ingredient and still show a confidence badge over it.
 */
import { rankAll, MIN_SCORE } from '../lib/fdcRank';

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

// Nothing plausible should sneak past the threshold.
const junk = rankAll('pappardelle', [
  { fdcId: 1, description: 'Pasta, dry, enriched', dataType: 'SR Legacy' },
  { fdcId: 2, description: 'Beverages, tea, black, brewed', dataType: 'SR Legacy' },
]);
const junkPassed = junk.filter((r) => r.score >= MIN_SCORE);
console.log(`${junkPassed.length === 0 ? 'PASS' : 'FAIL'}  "pappardelle" correctly matches nothing (best ${junk[0]!.score.toFixed(3)} — "${junk[0]!.hit.description}")`);
if (junkPassed.length) failures++;

console.log(failures === 0 ? '\nAll ranking checks passed.' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
