import type { CSSProperties } from 'react';

/** Ember design tokens — single source of truth (from the handoff spec). */
export const C = {
  bg: '#faf5ec',
  surface: '#ffffff',
  ink: '#241a12',
  dark: '#241a12',
  rust: '#c4552d',
  rustHover: '#a8461f',
  gold: '#e8a13c',
  green: '#2f7a4d',
  goldText: '#9a6a10',
  muted: 'rgba(36,26,18,0.6)',
  muted55: 'rgba(36,26,18,0.55)',
  muted65: 'rgba(36,26,18,0.65)',
  muted75: 'rgba(36,26,18,0.75)',
  line: 'rgba(36,26,18,0.12)',
  line15: 'rgba(36,26,18,0.15)',
  line22: 'rgba(36,26,18,0.22)',
  error: '#a33',
} as const;

/** Cuisine → accent colour (card top border + cuisine label). */
export const ACCENTS: Record<string, string> = {
  Italian: '#c4552d',
  Japanese: '#9a6a10',
  Thai: '#2f7a4d',
  Mexican: '#b0451f',
  Indian: '#a8621a',
  Korean: '#8c3b2e',
  Mediterranean: '#2f7a4d',
  French: '#7a5a2f',
  American: '#8c3b2e',
  Baking: '#9a6a10',
};
export const accentFor = (cuisine: string): string => ACCENTS[cuisine] ?? C.rust;

export const CUISINES = ['Italian', 'Japanese', 'Thai', 'Mexican', 'Indian', 'Korean', 'Mediterranean', 'French', 'American', 'Baking'];
export const DIETS = ['None', 'Vegetarian', 'Vegan', 'Pescatarian', 'Gluten-free', 'Dairy-free', 'Low-carb'];
export const SKILLS = ['Beginner', 'Comfortable', 'Adventurous'];
export const TIMES = ['15 min', '30 min', '45 min', '1 hr+'];
export const GOALS = ['Balanced', 'High protein', 'Low calorie', 'Heart healthy', 'No goal'];
export const ALLERGENS = ['Peanuts', 'Tree nuts', 'Milk', 'Eggs', 'Fish', 'Shellfish', 'Soy', 'Gluten', 'Sesame'];

/** Recipes are written for a base of 4 servings; scale ingredient quantities. */
export const BASE_SERVINGS = 4;

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

function formatQty(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const whole = Math.floor(rounded);
  const frac = rounded - whole;
  const near = (v: number) => Math.abs(frac - v) < 0.06;
  let fracStr = '';
  if (near(0.5)) fracStr = '½';
  else if (near(1 / 3)) fracStr = '⅓';
  else if (near(2 / 3)) fracStr = '⅔';
  else if (near(0.25)) fracStr = '¼';
  else if (near(0.75)) fracStr = '¾';
  else if (frac > 0.06) return String(rounded);
  if (whole === 0 && fracStr) return fracStr;
  return fracStr ? `${whole}${fracStr}` : String(whole);
}

/**
 * Scale the leading quantity in an ingredient line by a factor. Handles
 * integers, decimals, "1 1/2", and unicode fractions (½). Non-quantified lines
 * are returned unchanged.
 */
export function scaleIngredient(line: string, factor: number): string {
  if (factor === 1) return line;
  // "1 1/2 cups" or "1/2 cup"
  const asciiMixed = line.match(/^(\d+)\s+(\d+)\/(\d+)\s*(.*)$/);
  if (asciiMixed) {
    const val = (parseInt(asciiMixed[1]!) + parseInt(asciiMixed[2]!) / parseInt(asciiMixed[3]!)) * factor;
    return `${formatQty(val)} ${asciiMixed[4]}`.trim();
  }
  const asciiFrac = line.match(/^(\d+)\/(\d+)\s*(.*)$/);
  if (asciiFrac) {
    const val = (parseInt(asciiFrac[1]!) / parseInt(asciiFrac[2]!)) * factor;
    return `${formatQty(val)} ${asciiFrac[3]}`.trim();
  }
  const uni = line.match(/^(\d*)\s*([½⅓⅔¼¾⅛⅜⅝⅞])\s*(.*)$/);
  if (uni) {
    const val = ((uni[1] ? parseInt(uni[1]) : 0) + (UNICODE_FRACTIONS[uni[2]!] ?? 0)) * factor;
    return `${formatQty(val)} ${uni[3]}`.trim();
  }
  const dec = line.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (dec) {
    const val = parseFloat(dec[1]!) * factor;
    return `${formatQty(val)} ${dec[2]}`.trim();
  }
  return line;
}

export const mono = "'IBM Plex Mono', monospace";

/** Chip style (ported from the prototype's chip() helper). */
export function chipStyle(active: boolean, activeBg: string, small = false): CSSProperties {
  return {
    fontSize: small ? 12 : 12.5,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    padding: small ? '7px 13px' : '8px 16px',
    borderRadius: 999,
    border: active ? '1.5px solid transparent' : `1.5px solid ${C.line22}`,
    background: active ? activeBg : 'transparent',
    color: active ? '#fff' : C.muted75,
    lineHeight: 1,
  };
}

/** Nav pill style. */
export function navStyle(active: boolean): CSSProperties {
  return {
    fontFamily: 'inherit',
    fontSize: 13.5,
    fontWeight: 700,
    cursor: 'pointer',
    border: 'none',
    padding: '9px 18px',
    borderRadius: 999,
    background: active ? C.gold : 'transparent',
    color: active ? C.ink : 'rgba(36,26,18,0.65)',
  };
}

/** Repeating-stripe placeholder background (matches prototype thumbBg). */
export const stripeBg =
  'repeating-linear-gradient(45deg,#efe7d8,#efe7d8 10px,#e9dfcc 10px,#e9dfcc 20px)';

export function thumbBackground(photo: string | null | undefined): string {
  return photo ? `#e9dfcc url("${photo}") center/cover no-repeat` : stripeBg;
}

export const todayLabel = (): string =>
  new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// ─── Recipe imagery ─────────────────────────────────────────────────────────
interface ImageableRecipe {
  id: string;
  title: string;
  cuisine: string;
  tags?: string[];
  photo?: string | null;
}

/** Stable numeric hash of an id → deterministic image seed. */
export function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 100000;
}

/** Keyless Pollinations image URL (fallback when Gemini isn't configured). */
export function pollinationsUrl(prompt: string, width: number, height: number, seed: number): string {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
}

/**
 * Shared photographic style so a recipe's hero and every step read as one
 * coherent, high-quality series shot in the same kitchen.
 */
const KITCHEN_STYLE =
  'shot in a warm modern home kitchen on a light wooden countertop, soft natural window light, shallow depth of field, realistic high-resolution DSLR food photography, magazine quality, sharp focus, appetizing, no text or watermarks';

/** Build the image-generation prompt for a specific recipe's finished dish. */
export function recipeImagePrompt(title: string, cuisine: string): string {
  return `Appetizing overhead hero photo of the finished dish "${title}" (${cuisine} cuisine), beautifully plated on a ceramic plate, garnished, ${KITCHEN_STYLE}.`;
}

/**
 * Infer, from a step's wording, what the photo must physically show: which
 * vessel is in use, whether it sits on a lit stove, and which utensil/action is
 * involved. This grounds the generated image in real cooking so pans are on the
 * heat, ingredients land in the right container, and utensils match the task.
 */
function analyzeStep(text: string): string {
  const s = ` ${text.toLowerCase()} `;
  const has = (...ws: string[]) => ws.some((w) => s.includes(w));

  // Explicit vessel wins; otherwise infer from the action below.
  let vessel =
    has('skillet') ? 'a skillet' :
    has('wok') ? 'a wok' :
    has('saucepan') ? 'a saucepan' :
    has('dutch oven') ? 'a Dutch oven' :
    has('stockpot', ' pot') ? 'a pot' :
    has('frying pan', 'fry pan', 'nonstick', ' pan') ? 'a frying pan' :
    has('sheet pan', 'baking sheet', 'tray') ? 'a baking sheet' :
    has('casserole', 'baking dish', 'ovenproof') ? 'a baking dish' :
    has('blender', 'food processor') ? 'a blender' :
    has(' bowl') ? 'a mixing bowl' :
    '';

  const onHeat = has('sear', 'saut', 'fry', 'brown', 'boil', 'simmer', 'sizzl', 'melt', 'reduce', 'deglaze', 'poach', 'steam', 'caramel', 'scramble', 'stir-fry', 'stir fry', 'blanch', 'render', 'heat ', 'cook', 'toast', 'sweat', 'crisp');
  const oven = has('bake', 'roast', 'broil');
  const grill = has('grill', 'barbecue', 'char');
  const cut = has('chop', 'dice', 'slice', 'mince', 'julienne', 'peel', 'grate', 'shred', 'cut ', 'trim');
  const mix = has('whisk', 'mix', 'combine', 'beat', 'fold', 'stir together', 'toss', 'marinat', 'coat', 'season', 'mash', 'knead', 'dress', 'whip', 'blend', 'batter');
  const add = has('add', 'pour', 'drop', 'sprinkle', 'stir in', 'incorporat', 'transfer', 'fold in', 'arrange', 'layer', 'top with', 'spoon');
  const plate = has('serve', 'plate', 'garnish', 'drizzle', 'divide among', 'divide between');

  if (!vessel) {
    if (oven) vessel = 'a baking dish';
    else if (grill) vessel = 'a grill';
    else if (onHeat) vessel = 'a frying pan';
    else if (mix) vessel = 'a mixing bowl';
    else if (cut) vessel = 'a wooden cutting board';
    else if (plate) vessel = 'a serving plate';
    else vessel = 'the appropriate container';
  }

  // Cooking/heat dominates the scene when present (e.g. "add the diced onions
  // and sauté" is a stovetop step, not a cutting step — "diced" just describes
  // the onion). Pure prep actions fall through to the board/bowl.
  const bits: string[] = [];
  if (oven) bits.push(`${vessel} of food going into or resting inside a home oven`);
  else if (grill) bits.push(`food cooking on a hot grill with visible grill marks`);
  else if (onHeat) bits.push(`${vessel} sitting ON a lit stovetop burner over visible heat, with gentle steam or a light sizzle`);
  else if (mix) bits.push(`ingredients being combined in ${vessel} on the countertop using the right tool (whisk, spatula or spoon)`);
  else if (cut) bits.push(`ingredients being ${text.match(/\b(chop|dice|slice|mince|peel|grate|shred|trim)\w*/i)?.[0]?.toLowerCase() ?? 'cut'} on a wooden cutting board with a chef's knife`);
  else if (plate) bits.push(`the finished dish being portioned and garnished on serving plates or bowls`);
  else bits.push(`the ingredients resting in ${vessel}`);

  if (add && !cut && !plate && !oven) bits.push(`the ingredient this step names shown mid-motion clearly being added INTO ${vessel}`);

  return bits.join(', ');
}

/**
 * Feedback taxonomy for a step image. `label` is shown to the user; `fix` is the
 * corrective instruction folded into the regeneration prompt so the model
 * addresses exactly what was wrong. Shared by the client UI and the server.
 */
export const STEP_IMAGE_ISSUES: { key: string; label: string; fix: string }[] = [
  { key: 'not-on-stove', label: 'Not on the stove', fix: 'the pan or pot MUST sit on a lit stovetop burner over visible heat, never floating or on a bare counter' },
  { key: 'wrong-tool', label: 'Wrong pan/utensil', fix: 'use the correct cookware and utensil for this exact action' },
  { key: 'ingredients-missing', label: 'Ingredients not added', fix: 'clearly show the ingredients this step names being added INTO the correct pan, pot or bowl' },
  { key: 'unrealistic', label: 'Looks unreal', fix: 'remove any distorted, floating, duplicated or invented objects; keep hands, fingers and food proportions natural and realistic' },
  { key: 'mismatch', label: "Doesn't match step", fix: 'the image must depict exactly what the written step describes and nothing else' },
];

/** Build the image-generation prompt illustrating a single method step. */
export function stepImagePrompt(cuisine: string, stepText: string, title?: string): string {
  const clean = stepText.replace(/\s+/g, ' ').slice(0, 260);
  const dish = title ? ` while making "${title}" (${cuisine} cuisine)` : ` (${cuisine} cuisine)`;
  const scene = analyzeStep(clean);
  return [
    `Photorealistic close-up instructional cooking photo showing exactly this recipe step${dish}: "${clean}".`,
    `Show: ${scene}.`,
    `Cooking realism (must obey): any pan or pot used to cook sits directly on a lit stovetop burner over visible heat — never floating or on a bare counter; ingredients being added are clearly going INTO the correct pan, pot or bowl (not beside it); include only the ingredients and utensils this exact step needs and nothing extra or invented; realistic proportions and quantities; at most two human hands, correct number of fingers; no duplicated, floating, or nonsensical objects; utensils must match the task (knife for cutting, whisk/spoon for mixing, tongs or spatula at the pan).`,
    KITCHEN_STYLE + '.',
  ].join(' ');
}

/**
 * The image to show for a recipe: the user's uploaded photo if present,
 * otherwise our same-origin image proxy (/api/img/recipe/:id). The proxy
 * resolves to a cached Vercel Blob image (generated once via Gemini "Nano
 * Banana" or server-side Pollinations) — so the browser never calls an image
 * provider directly and per-IP rate limits can't break a gallery of thumbnails.
 * Usable as an <img src> or a CSS background URL.
 */
export function recipeImageUrl(r: ImageableRecipe): string {
  if (r.photo) return r.photo;
  return `/api/img/recipe/${r.id}`;
}

/** Keyless Pollinations instructional image for one method step. */
export function stepImageUrl(recipeId: string, cuisine: string, stepIndex: number, stepText: string, title?: string): string {
  return pollinationsUrl(stepImagePrompt(cuisine, stepText, title), 512, 340, hashId(recipeId + ':' + stepIndex));
}

const CUISINE_EMOJI: Record<string, string> = {
  Italian: '🍝', Japanese: '🍱', Thai: '🍜', Mexican: '🌮', Indian: '🍛',
  Korean: '🍲', Mediterranean: '🥙', French: '🥐', American: '🍔', Baking: '🍪',
};
const TAG_EMOJI: Record<string, string> = {
  pasta: '🍝', cookies: '🍪', dessert: '🍰', tacos: '🌮', salad: '🥗', seafood: '🦐',
  bread: '🍞', curry: '🍛', bowls: '🥣', noodles: '🍜', soup: '🍜', pizza: '🍕', cake: '🍰',
};

/** Emoji shown behind a card if the photo fails to load. */
export function foodEmoji(r: ImageableRecipe): string {
  for (const t of r.tags || []) {
    const e = TAG_EMOJI[t.toLowerCase()];
    if (e) return e;
  }
  return CUISINE_EMOJI[r.cuisine] || '🍽️';
}

/** Soft cuisine-tinted gradient used as the image's backdrop / fallback. */
export function gradientFor(cuisine: string): string {
  const a = accentFor(cuisine);
  return `linear-gradient(135deg, ${a}22, ${a}44)`;
}
