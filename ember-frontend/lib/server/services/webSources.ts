import 'server-only';
import dns from 'node:dns/promises';
import net from 'node:net';
import RssParser from 'rss-parser';
import { config } from '../config';
import { logger } from '../logger';
import { badRequest } from '../http';
import { generateRecipe, type ProfileForPrompt } from './ai';
import type { GeneratedRecipe } from '../recipeSchema';

const rss = new RssParser({ timeout: 8000 });

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
