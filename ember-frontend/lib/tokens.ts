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

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 100000;
}

/** Build the image-generation prompt for a specific recipe. */
export function recipeImagePrompt(title: string, cuisine: string): string {
  return `appetizing professional food photography of ${title}, ${cuisine} cuisine, plated on a dish, natural soft light, top-down, high detail`;
}

/**
 * The image to show for a recipe: the user's uploaded photo if present,
 * otherwise a dish photo generated to MATCH this specific recipe (via
 * Pollinations image generation — keyless). Deterministic per recipe (fixed
 * `seed`) so it's stable and cached, not random on every load.
 */
export function recipeImageUrl(r: ImageableRecipe): string {
  if (r.photo) return r.photo;
  const prompt = recipeImagePrompt(r.title, r.cuisine);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=600&height=400&nologo=true&seed=${hashId(r.id)}`;
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
