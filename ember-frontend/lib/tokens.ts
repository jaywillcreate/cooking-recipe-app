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
  cuisine: string;
  tags?: string[];
  photo?: string | null;
}

const FOOD_TAGS = new Set([
  'pasta', 'noodles', 'seafood', 'cookies', 'dessert', 'tacos', 'salad', 'bread',
  'bowls', 'curry', 'soup', 'brunch', 'baking', 'cake', 'pizza', 'rice',
]);

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 100000;
}

/**
 * The image to show for a recipe: the user's uploaded photo if present,
 * otherwise a relevant food photo pulled by keyword (cuisine + a food tag).
 * Deterministic per recipe (stable `lock`) so it doesn't change on every load.
 */
export function recipeImageUrl(r: ImageableRecipe): string {
  if (r.photo) return r.photo;
  const foodTag = (r.tags || []).map((t) => t.toLowerCase()).find((t) => FOOD_TAGS.has(t));
  const kw = [r.cuisine.toLowerCase().replace(/[^a-z]/g, ''), foodTag, 'food'].filter(Boolean).join(',');
  return `https://loremflickr.com/600/400/${encodeURIComponent(kw)}?lock=${hashId(r.id)}`;
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
