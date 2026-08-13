import 'server-only';
import dns from 'node:dns/promises';
import net from 'node:net';
import RssParser from 'rss-parser';
import { config } from '../config';
import { logger } from '../logger';
import { badRequest } from '../http';
import { generateRecipe, type ProfileForPrompt } from './ai';
import type { GeneratedRecipe } from '../recipeSchema';

const rss = new RssParser({
  timeout: 8000,
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['content:encoded', 'contentEncoded'],
    ],
  },
});

export function normalizeDomain(input: string): string {
  const domain = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]!;
  if (!domain || !domain.includes('.') || domain.length > 253) throw badRequest('Enter a site like smittenkitchen.com');
  if (!/^[a-z0-9.-]+$/.test(domain)) throw badRequest('Invalid domain');
  if (config.siteAllowlist.length && !config.siteAllowlist.includes(domain)) throw badRequest('That site is not on the allowed list.');
  return domain;
}

/** SSRF guard: refuse private/loopback/link-local addresses before any fetch. */
export async function assertPublicDomain(domain: string): Promise<void> {
  let addrs: string[];
  try {
    addrs = (await dns.lookup(domain, { all: true })).map((r) => r.address);
  } catch {
    throw badRequest(`Could not resolve ${domain}`);
  }
  for (const addr of addrs) if (isPrivateAddress(addr)) throw badRequest('That address is not allowed.');
}

function isPrivateAddress(addr: string): boolean {
  if (net.isIPv4(addr)) {
    const [a, b] = addr.split('.').map(Number) as [number, number, number, number];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const lower = addr.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
  if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.replace('::ffff:', ''));
  return false;
}

/** Fetch the latest recipe from a followed site (real RSS, AI fallback). */
export async function fetchLatestFromSite(
  domain: string,
  profile: ProfileForPrompt,
  userId: string,
): Promise<{ recipe: GeneratedRecipe; via: 'rss' | 'ai' }> {
  await assertPublicDomain(domain);
  const feeds = [`https://${domain}/feed`, `https://${domain}/feed/`, `https://${domain}/rss`, `https://${domain}/index.xml`];
  for (const url of feeds) {
    try {
      const feed = await rss.parseURL(url);
      const item = feed.items?.[0];
      if (item?.title) {
        const recipe = await generateRecipe({
          kind: 'web', userId, profile,
          params: { purpose: `Structure this real blog post from ${domain} into our recipe schema`, title: item.title, summary: (item.contentSnippet || item.content || '').slice(0, 600), sourceUrl: item.link },
        });
        return { recipe, via: 'rss' };
      }
    } catch (err) {
      logger.warn({ err: String(err), url }, 'RSS candidate failed');
    }
  }
  const recipe = await generateRecipe({
    kind: 'web', userId, profile,
    params: { purpose: `Invent ONE recipe that could plausibly be the latest post on the food blog ${domain}, matching its typical style and voice`, site: domain },
  });
  return { recipe, via: 'ai' };
}

// ─── Live web recipe search (Discover → "Fresh from the kitchen") ───────────

export interface WebRecipeLink {
  title: string;
  url: string;
  source: string;
  snippet: string;
  image?: string;
}

/** Best-effort thumbnail from an RSS item: media tags, enclosure, or the first inline <img>. */
function itemImage(item: Record<string, unknown>): string | undefined {
  const url = (v: unknown): string | undefined =>
    typeof v === 'string' && /^https?:\/\//.test(v) ? v : undefined;
  const mediaUrl = (v: unknown): string | undefined => {
    const first = Array.isArray(v) ? v[0] : v;
    return url((first as { $?: { url?: unknown } } | undefined)?.$?.url);
  };
  const enclosure = item.enclosure as { url?: unknown; type?: unknown } | undefined;
  const enclosureUrl =
    enclosure && (!enclosure.type || String(enclosure.type).startsWith('image/')) ? url(enclosure.url) : undefined;
  const html = `${typeof item.contentEncoded === 'string' ? item.contentEncoded : ''}${typeof item.content === 'string' ? item.content : ''}`;
  const inline = url(/<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1]);
  return mediaUrl(item.mediaContent) ?? mediaUrl(item.mediaThumbnail) ?? enclosureUrl ?? inline;
}

/**
 * Curated, well-known recipe sites with reliable RSS feeds. Cuisine-tagged
 * feeds are chosen to match the user's profile; untagged feeds are general
 * interest and pad out the mix.
 */
const CURATED_FEEDS: { source: string; url: string; cuisines: string[] }[] = [
  { source: 'smittenkitchen.com', url: 'https://smittenkitchen.com/feed/', cuisines: [] },
  { source: 'budgetbytes.com', url: 'https://www.budgetbytes.com/feed/', cuisines: ['American'] },
  { source: 'pinchofyum.com', url: 'https://pinchofyum.com/feed/', cuisines: [] },
  { source: 'halfbakedharvest.com', url: 'https://www.halfbakedharvest.com/feed/', cuisines: [] },
  { source: 'cookieandkate.com', url: 'https://cookieandkate.com/feed/', cuisines: [] },
  { source: 'loveandlemons.com', url: 'https://www.loveandlemons.com/feed/', cuisines: [] },
  { source: 'thewoksoflife.com', url: 'https://thewoksoflife.com/feed/', cuisines: ['Chinese'] },
  { source: 'justonecookbook.com', url: 'https://www.justonecookbook.com/feed/', cuisines: ['Japanese'] },
  { source: 'vegrecipesofindia.com', url: 'https://www.vegrecipesofindia.com/feed/', cuisines: ['Indian'] },
  { source: 'mexicanplease.com', url: 'https://www.mexicanplease.com/feed/', cuisines: ['Mexican'] },
  { source: 'themediterraneandish.com', url: 'https://www.themediterraneandish.com/feed/', cuisines: ['Mediterranean', 'Greek', 'Middle Eastern'] },
  { source: 'koreanbapsang.com', url: 'https://www.koreanbapsang.com/feed/', cuisines: ['Korean'] },
  { source: 'davidlebovitz.com', url: 'https://www.davidlebovitz.com/feed/', cuisines: ['French'] },
  { source: 'sallysbakingaddiction.com', url: 'https://sallysbakingaddiction.com/feed/', cuisines: ['Baking'] },
];

// Best-effort in-memory cache (per serverless instance) so the Discover page
// doesn't hit a dozen RSS feeds on every load.
const webCache = new Map<string, { at: number; items: WebRecipeLink[] }>();
const WEB_CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Live-search the web for fresh recipes personalized to the user's profile:
 * feeds are picked by favourite cuisine, and items mentioning the cuisines or
 * liked tastes rank first. Failures degrade to an empty list, never an error.
 */
export async function searchWebRecipes(cuisines: string[], liked: string[], limit = 8): Promise<WebRecipeLink[]> {
  const key = [...cuisines].sort().join('|');
  const hit = webCache.get(key);
  if (hit && Date.now() - hit.at < WEB_CACHE_TTL_MS) return hit.items.slice(0, limit);

  const matched = CURATED_FEEDS.filter((f) => f.cuisines.some((c) => cuisines.includes(c)));
  const general = CURATED_FEEDS.filter((f) => f.cuisines.length === 0);
  const feeds = [...matched.slice(0, 4), ...general.slice(0, Math.max(2, 5 - matched.length))];

  const results = await Promise.allSettled(
    feeds.map(async (f) => {
      const feed = await rss.parseURL(f.url);
      return (feed.items ?? [])
        .slice(0, 4)
        .map((item) => ({
          title: (item.title ?? '').trim(),
          url: item.link ?? `https://${f.source}`,
          source: f.source,
          snippet: (item.contentSnippet || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 160),
          image: itemImage(item as unknown as Record<string, unknown>),
        }))
        .filter((i) => i.title);
    }),
  );
  const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

  // Rank taste matches first, keep feed recency order otherwise, and cap two
  // items per source so one prolific blog doesn't crowd out the rest.
  const terms = [...cuisines, ...liked].map((t) => t.toLowerCase()).filter(Boolean);
  const score = (i: WebRecipeLink) => {
    const hay = `${i.title} ${i.snippet}`.toLowerCase();
    return terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0) + (matched.some((f) => f.source === i.source) ? 1 : 0);
  };
  const ranked = items
    .map((i, idx) => ({ i, s: score(i), idx }))
    .sort((a, b) => b.s - a.s || a.idx - b.idx);
  const perSource = new Map<string, number>();
  const out: WebRecipeLink[] = [];
  for (const { i } of ranked) {
    const n = perSource.get(i.source) ?? 0;
    if (n >= 2) continue;
    perSource.set(i.source, n + 1);
    out.push(i);
    if (out.length >= limit) break;
  }
  if (out.length) webCache.set(key, { at: Date.now(), items: out });
  return out;
}
