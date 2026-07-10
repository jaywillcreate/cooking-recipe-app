import 'server-only';
import crypto from 'node:crypto';
import { put } from '@vercel/blob';
import { query, queryOne } from '../db';
import { config } from '../config';
import { logger } from '../logger';

/**
 * Recipe & step imagery, backed by Google's Gemini 2.5 Flash Image model
 * ("Nano Banana"). Because Gemini returns raw image bytes (not a hotlinkable
 * URL), each generation is uploaded to Vercel Blob and the resulting CDN URL is
 * cached in Postgres, keyed deterministically — so every image is generated at
 * most once and reused forever.
 *
 * Step images are generated image-to-image: each references the recipe's hero
 * dish photo so the whole method reads as ONE consistent kitchen — same surface,
 * cookware, palette and light — which is exactly what Nano Banana is built for.
 *
 * Graceful degradation: if GEMINI_API_KEY is unset, or generation/upload fails,
 * the caller falls back to the keyless Pollinations URL. Nothing here throws to
 * the request path.
 */

const GEMINI_TIMEOUT_MS = 40_000;
const MAX_REFERENCE_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// Create the cache table lazily (once per warm instance) so the feature works
// without a separate migration step on the user's push-to-Vercel deploy flow.
let ensured: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!ensured) {
    ensured = query(
      `CREATE TABLE IF NOT EXISTS generated_images (
         cache_key  TEXT PRIMARY KEY,
         url        TEXT NOT NULL,
         provider   TEXT NOT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    ).then(() => undefined).catch((err) => {
      ensured = null; // allow a retry on the next call
      throw err;
    });
  }
  return ensured;
}

interface GeminiPart {
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}

interface InlineImage {
  data: string; // base64
  mime: string;
}

/**
 * Call Gemini and return the first image part as raw bytes, or null on failure.
 * An optional `reference` image is sent alongside the prompt for image-to-image
 * generation (visual consistency / editing).
 */
async function generateWithGemini(prompt: string, reference?: InlineImage): Promise<{ buffer: Buffer; mime: string } | null> {
  const key = config.geminiApiKey;
  if (!key) return null;

  const parts: unknown[] = [];
  if (reference) parts.push({ inlineData: { mimeType: reference.mime, data: reference.data } });
  parts.push({ text: prompt });

  // A wide frame suits the recipe/step cards, but `imageConfig` is a newer field
  // — if this API version rejects it we retry without it rather than failing.
  const result = await callGemini(key, parts, { imageConfig: { aspectRatio: '4:3' } });
  if (result !== 'config-rejected') return result;
  const retry = await callGemini(key, parts, undefined);
  return retry === 'config-rejected' ? null : retry;
}

type GeminiResult = { buffer: Buffer; mime: string } | null | 'config-rejected';

async function callGemini(key: string, parts: unknown[], generationConfig?: Record<string, unknown>): Promise<GeminiResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);
  try {
    const body: Record<string, unknown> = { contents: [{ parts }] };
    if (generationConfig) body.generationConfig = generationConfig;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiImageModel}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      },
    );
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      // 400 while sending the optional config → signal a retry without it.
      if (res.status === 400 && generationConfig) return 'config-rejected';
      logger.warn({ status: res.status, body: text }, 'Gemini image request failed');
      return null;
    }
    const data = (await res.json()) as { candidates?: { content?: { parts?: GeminiPart[] } }[] };
    for (const part of data.candidates?.[0]?.content?.parts ?? []) {
      const inline = part.inlineData ?? part.inline_data;
      const b64 = inline?.data;
      if (b64) {
        const mime = (part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? 'image/png').toLowerCase();
        return { buffer: Buffer.from(b64, 'base64'), mime: EXT[mime] ? mime : 'image/png' };
      }
    }
    logger.warn('Gemini image response contained no image part');
    return null;
  } catch (err) {
    logger.warn({ err: String(err) }, 'Gemini image generation errored');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Download a previously-generated Blob image and return it as base64 for reuse as a reference. */
async function fetchAsInline(url: string): Promise<InlineImage | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_REFERENCE_BYTES) return null;
    const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
    return { data: buf.toString('base64'), mime };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Upload generated bytes to Blob and record the cache row; returns the canonical URL. */
async function uploadAndCache(cacheKey: string, img: { buffer: Buffer; mime: string }): Promise<string> {
  const ext = EXT[img.mime] ?? 'png';
  const { url } = await put(`ember/gen/${crypto.randomBytes(16).toString('hex')}.${ext}`, img.buffer, {
    access: 'public',
    contentType: img.mime,
  });
  // If two requests raced, the first winner's URL stays; ours is a harmless orphan.
  await query(
    `INSERT INTO generated_images (cache_key, url, provider) VALUES ($1, $2, 'gemini')
     ON CONFLICT (cache_key) DO NOTHING`,
    [cacheKey, url],
  );
  const row = await queryOne<{ url: string }>(`SELECT url FROM generated_images WHERE cache_key = $1`, [cacheKey]);
  return row?.url ?? url;
}

/** Return a cached Blob URL for `cacheKey` without generating anything. */
export async function peekCachedImage(cacheKey: string): Promise<string | null> {
  try {
    await ensureTable();
    const hit = await queryOne<{ url: string }>(`SELECT url FROM generated_images WHERE cache_key = $1`, [cacheKey]);
    return hit?.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve a durable text-to-image URL for `cacheKey` (used for the recipe hero):
 *   1. cache hit         → return stored Blob URL
 *   2. Gemini enabled    → generate → upload to Blob → cache → return URL
 *   3. otherwise / fail  → return null (caller uses the Pollinations fallback)
 */
export async function resolveGeneratedImage(cacheKey: string, prompt: string): Promise<string | null> {
  try {
    await ensureTable();
    const hit = await queryOne<{ url: string }>(`SELECT url FROM generated_images WHERE cache_key = $1`, [cacheKey]);
    if (hit) return hit.url;
    if (!config.geminiEnabled) return null;

    const img = await generateWithGemini(prompt);
    if (!img) return null;
    return await uploadAndCache(cacheKey, img);
  } catch (err) {
    logger.warn({ err: String(err), cacheKey }, 'resolveGeneratedImage failed — falling back');
    return null;
  }
}

/**
 * Resolve a step image, generated image-to-image against the recipe's hero
 * photo so every step shares the same kitchen for a consistent visual series.
 * The hero is generated first (and cached) if it doesn't yet exist. Falls back
 * to plain text-to-image if the anchor can't be produced, and to null (→
 * Pollinations) on any failure.
 */
export async function resolveStepImage(params: {
  cacheKey: string;
  stepPrompt: string;
  anchorCacheKey: string;
  anchorPrompt: string;
}): Promise<string | null> {
  try {
    await ensureTable();
    const hit = await queryOne<{ url: string }>(`SELECT url FROM generated_images WHERE cache_key = $1`, [params.cacheKey]);
    if (hit) return hit.url;
    if (!config.geminiEnabled) return null;

    // Lock the visual style to the recipe's hero dish photo.
    let reference: InlineImage | null = null;
    const anchorUrl = await resolveGeneratedImage(params.anchorCacheKey, params.anchorPrompt);
    if (anchorUrl) reference = await fetchAsInline(anchorUrl);

    const prompt = reference
      ? `${params.stepPrompt}\n\nUse the attached reference photo as the fixed scene: keep the EXACT same kitchen, countertop surface, cookware, dishware, color palette and lighting so this reads as one step in a consistent step-by-step series. Only the food's state and the action shown should change to depict this step.`
      : params.stepPrompt;

    const img = await generateWithGemini(prompt, reference ?? undefined);
    if (!img) return null;
    return await uploadAndCache(params.cacheKey, img);
  } catch (err) {
    logger.warn({ err: String(err), cacheKey: params.cacheKey }, 'resolveStepImage failed — falling back');
    return null;
  }
}
