/**
 * Derive the cooking tools/equipment a recipe needs by scanning its ingredients
 * and method for tell-tale words. Heuristic (no AI/network) so it works for
 * every recipe instantly. `icon` maps to a line-art icon in KitchenIcons.
 */
export type KitchenIconName =
  | 'board' | 'knife' | 'peeler' | 'grater' | 'bowl' | 'whisk' | 'measuring'
  | 'skillet' | 'saucepan' | 'pot' | 'wok' | 'sheet' | 'dish' | 'oven'
  | 'blender' | 'processor' | 'mixer' | 'colander' | 'tongs' | 'rollingpin' | 'grill';

export interface Equip {
  name: string;
  icon: KitchenIconName;
}

interface Rule extends Equip {
  re: RegExp;
}

const RULES: Rule[] = [
  { name: 'Cutting board', icon: 'board', re: /\b(chop|dice|slice|minc|julienne|cube|cut into|finely|shred|halve|quarter)/i },
  { name: "Chef's knife", icon: 'knife', re: /\b(chop|dice|slice|minc|julienne|cube|cut |knife|carve)/i },
  { name: 'Peeler', icon: 'peeler', re: /\b(peel)/i },
  { name: 'Grater / zester', icon: 'grater', re: /\b(grate|zest|zested|parmesan|shredded cheese)/i },
  { name: 'Mixing bowl', icon: 'bowl', re: /\b(bowl|combine|whisk together|toss|fold in|marinate|coat|dredge|batter|dough)/i },
  { name: 'Whisk', icon: 'whisk', re: /\b(whisk)/i },
  { name: 'Measuring cups & spoons', icon: 'measuring', re: /\b(\d+\s*(cup|tbsp|tsp|teaspoon|tablespoon)|preheat|baking)/i },
  { name: 'Skillet / frying pan', icon: 'skillet', re: /\b(skillet|frying pan|fry pan|sauté|saute|sear|pan-fry|fry |brown the|non-stick)/i },
  { name: 'Saucepan', icon: 'saucepan', re: /\b(saucepan|simmer|reduce|sauce|melt|warm the|heat the (milk|cream|broth|stock))/i },
  { name: 'Large pot / Dutch oven', icon: 'pot', re: /\b(boil|blanch|braise|dutch oven|stockpot|large pot|stew|pasta|noodles)/i },
  { name: 'Wok', icon: 'wok', re: /\b(wok|stir-fry|stir fry)/i },
  { name: 'Baking sheet / tray', icon: 'sheet', re: /\b(baking sheet|sheet pan|tray|line a|parchment|cookies|roast)/i },
  { name: 'Baking dish', icon: 'dish', re: /\b(baking dish|casserole|9x13|ovenproof|gratin)/i },
  { name: 'Oven', icon: 'oven', re: /\b(oven|bake|roast|broil|350|375|400|425|450|°f|°c)/i },
  { name: 'Blender', icon: 'blender', re: /\b(blend|purée|puree|smoothie|until smooth)/i },
  { name: 'Food processor', icon: 'processor', re: /\b(food processor|pulse)/i },
  { name: 'Stand / hand mixer', icon: 'mixer', re: /\b(mixer|beat (in|the|until)|cream the|knead|whip)/i },
  { name: 'Colander / strainer', icon: 'colander', re: /\b(drain|strain|rinse under|colander)/i },
  { name: 'Tongs', icon: 'tongs', re: /\b(tongs|flip|turn the)/i },
  { name: 'Rolling pin', icon: 'rollingpin', re: /\b(roll out|rolling pin|flatten the dough)/i },
  { name: 'Grill / grill pan', icon: 'grill', re: /\b(grill|char|barbecue|bbq)/i },
];

export function deriveEquipment(ingredients: string[], steps: string[]): Equip[] {
  const text = [...(ingredients ?? []), ...(steps ?? [])].join(' \n ').toLowerCase();
  const seen = new Set<string>();
  const out: Equip[] = [];
  for (const r of RULES) {
    if (r.re.test(text) && !seen.has(r.name)) {
      seen.add(r.name);
      out.push({ name: r.name, icon: r.icon });
    }
  }
  if (!seen.has('Cutting board')) out.unshift({ name: 'Cutting board', icon: 'board' });
  return out;
}
