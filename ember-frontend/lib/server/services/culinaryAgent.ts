import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { query, queryOne } from '../db';
import { config } from '../config';
import { logger } from '../logger';

/**
 * Culinary research agent. Periodically (weekly cron, or manual trigger)
 * researches current culinary best practices on the live web — instruction
 * writing, technique, doneness cues, food safety — using Claude with the
 * web-search tool, distills the findings into a compact guidance block, and
 * stores it. Recipe generation folds the latest guidance into its prompt, so
 * the Method steps the site produces keep improving over time without a deploy.
 */

const GUIDANCE_TTL_MS = 10 * 60 * 1000;
let cache: { at: number; text: string } | null = null;

let ensured: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!ensured) {
    ensured = query(
      `CREATE TABLE IF NOT EXISTS culinary_guidance (
         id         BIGSERIAL PRIMARY KEY,
         content    TEXT NOT NULL,
         sources    JSONB NOT NULL DEFAULT '[]'::jsonb,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    ).then(() => undefined).catch((err) => {
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

/** Latest stored guidance (empty string when none yet). In-process cached. */
export async function getCulinaryGuidance(): Promise<string> {
  const now = Date.now();
  if (cache && now - cache.at < GUIDANCE_TTL_MS) return cache.text;
  let text = '';
  try {
    await ensureTable();
    const row = await queryOne<{ content: string }>(`SELECT content FROM culinary_guidance ORDER BY created_at DESC LIMIT 1`);
    text = row?.content ?? '';
  } catch {
    /* table unavailable — generation proceeds without extra guidance */
  }
  cache = { at: now, text };
  return text;
}

const RESEARCH_PROMPT = `You are a culinary editor for a recipe app. Research CURRENT best practices from top-rated culinary sources (e.g. Serious Eats, America's Test Kitchen, NYT Cooking, Bon Appétit, King Arthur, professional culinary schools) on how to write excellent step-by-step cooking directions for home cooks.

Focus on: instruction clarity, heat levels and times, sensory doneness cues, safe internal temperatures, technique tips worth explaining (the "why"), resting/carryover cooking, seasoning-as-you-go, mise en place, and any newly emphasized techniques or safety updates.

Then distill everything into a guidance block for a recipe-writing AI:
- 8 to 14 short imperative bullet lines, each one concrete rule or tip it should apply when writing recipe steps.
- Nothing generic ("be clear") — every line must be specific and actionable.
- No headers, no commentary. Output ONLY the bullet lines, each starting with "- ".
- Keep the whole block under 1400 characters.`;

/** Run the research pass and store a new guidance block. Returns a summary. */
export async function refreshCulinaryGuidance(): Promise<{ ok: boolean; chars: number; sources: string[] }> {
  await ensureTable();
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const msg = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 2000,
    tools: [{ type: 'web_search_20250305' as never, name: 'web_search', max_uses: 6 } as never],
    messages: [{ role: 'user', content: RESEARCH_PROMPT }],
  });

  // Collect the final text and any cited source URLs.
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  const sources = Array.from(
    new Set(
      msg.content.flatMap((b) => {
        const cites = (b as { citations?: { url?: string }[] }).citations;
        return (cites ?? []).map((c) => c.url).filter((u): u is string => !!u);
      }),
    ),
  ).slice(0, 12);

  // Keep only the bullet lines; guard against an empty/degenerate result.
  const bullets = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .join('\n')
    .slice(0, 1600);
  if (bullets.length < 80) {
    logger.warn({ got: text.slice(0, 200) }, 'Culinary research returned no usable guidance — keeping previous');
    return { ok: false, chars: 0, sources };
  }

  await query(`INSERT INTO culinary_guidance (content, sources) VALUES ($1, $2)`, [bullets, JSON.stringify(sources)]);
  // Retain history but prune far-old rows.
  await query(`DELETE FROM culinary_guidance WHERE id NOT IN (SELECT id FROM culinary_guidance ORDER BY created_at DESC LIMIT 20)`);
  cache = null;
  logger.info({ chars: bullets.length, sources: sources.length }, 'Culinary guidance refreshed');
  return { ok: true, chars: bullets.length, sources };
}
