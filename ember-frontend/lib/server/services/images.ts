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
 * Graceful degradation: if GEMINI_API_KEY is unset, or generation/upload fails,
 * the caller falls back to the keyless Pollinations URL. Nothing here throws to
 * the request path.
 */

const GEMINI_TIMEOUT_MS = 30_000;
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

/** Call Gemini and return the first image part as raw bytes, or null on failure. */
async function generateWithGemini(prompt: string): Promise<{ buffer: Buffer; mime: string } | null> {
  const key = config.geminiApiKey;
  if (!key) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiImageModel}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: ctrl.signal,
      },
    );
    if (!res.ok) {
      logger.warn({ status: res.status, body: (await res.text()).slice(0, 300) }, 'Gemini image request failed');
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
 * Resolve a durable image URL for `cacheKey`:
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
  } catch (err) {
    logger.warn({ err: String(err), cacheKey }, 'resolveGeneratedImage failed — falling back');
    return null;
  }
}
