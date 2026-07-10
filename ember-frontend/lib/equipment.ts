/**
 * Derive the cooking tools/equipment a recipe needs by scanning its ingredients
 * and method for tell-tale words. Heuristic (no AI/network) so it works for
 * every recipe instantly. Order = rough prep→cook→finish; deduped by name.
 */
export interface Equip {
  name: string;
  emoji: string;
}

interface Rule {
  name: string;
  emoji: string;
  re: RegExp;
}

const RULES: Rule[] = [
  { name: 'Cutting board', emoji: '🪵', re: /\b(chop|dice|slice|minc|julienne|cube|cut into|finely|shred|halve|quarter)/i },
  { name: "Chef's knife", emoji: '🔪', re: /\b(chop|dice|slice|minc|julienne|cube|cut |knife|carve)/i },
  { name: 'Peeler', emoji: '🥔', re: /\b(peel)/i },
  { name: 'Grater / zester', emoji: '🧀', re: /\b(grate|zest|zested|parmesan|shredded cheese)/i },
  { name: 'Mixing bowl', emoji: '🥣', re: /\b(bowl|combine|whisk together|toss|fold in|marinate|coat|dredge|batter|dough)/i },
  { name: 'Whisk', emoji: '🥄', re: /\b(whisk)/i },
  { name: 'Measuring cups & spoons', emoji: '🥄', re: /\b(\d+\s*(cup|tbsp|tsp|teaspoon|tablespoon)|preheat|baking)/i },
  { name: 'Skillet / frying pan', emoji: '🍳', re: /\b(skillet|frying pan|fry pan|sauté|saute|sear|pan-fry|fry |brown the|non-stick)/i },
  { name: 'Saucepan', emoji: '🍲', re: /\b(saucepan|simmer|reduce|sauce|melt|warm the|heat the (milk|cream|broth|stock))/i },
  { name: 'Large pot / Dutch oven', emoji: '🥘', re: /\b(boil|blanch|braise|dutch oven|stockpot|large pot|stew|pasta|noodles)/i },
  { name: 'Wok', emoji: '🥢', re: /\b(wok|stir-fry|stir fry)/i },
  { name: 'Baking sheet / tray', emoji: '🍪', re: /\b(baking sheet|sheet pan|tray|line a|parchment|cookies|roast)/i },
  { name: 'Baking dish', emoji: '🥧', re: /\b(baking dish|casserole|9x13|ovenproof|gratin)/i },
  { name: 'Oven', emoji: '🔥', re: /\b(oven|bake|roast|broil|350|375|400|425|450|°f|°c)/i },
  { name: 'Blender', emoji: '🌀', re: /\b(blend|purée|puree|smoothie|until smooth)/i },
  { name: 'Food processor', emoji: '⚙️', re: /\b(food processor|pulse)/i },
  { name: 'Stand / hand mixer', emoji: '🎛️', re: /\b(mixer|beat (in|the|until)|cream the|knead|whip)/i },
  { name: 'Colander / strainer', emoji: '🕳️', re: /\b(drain|strain|rinse under|colander)/i },
  { name: 'Tongs', emoji: '🍴', re: /\b(tongs|flip|turn the)/i },
  { name: 'Rolling pin', emoji: '🎳', re: /\b(roll out|rolling pin|flatten the dough)/i },
  { name: 'Grill / grill pan', emoji: '🔥', re: /\b(grill|char|barbecue|bbq)/i },
];

export function deriveEquipment(ingredients: string[], steps: string[]): Equip[] {
  const text = [...(ingredients ?? []), ...(steps ?? [])].join(' \n ').toLowerCase();
  const seen = new Set<string>();
  const out: Equip[] = [];
  for (const r of RULES) {
    if (r.re.test(text) && !seen.has(r.name)) {
      seen.add(r.name);
      out.push({ name: r.name, emoji: r.emoji });
    }
  }
  // Almost every recipe needs a knife + board; ensure the basics show.
  if (!seen.has('Cutting board')) out.unshift({ name: 'Cutting board', emoji: '🪵' });
  return out;
}
