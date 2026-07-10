import 'server-only';
import crypto from 'node:crypto';
import { put } from '@vercel/blob';
import { query, queryOne } from '../db';
import { config } from '../config';
import { logger } from '../logger';
import { pollinationsUrl, hashId } from '@/lib/tokens';

/**
 * Recipe & step imagery, resolved to a durable Vercel Blob URL and cached in
 * Postgres so each image is generated at most once and then served from the CDN.
 *
 * Providers, in order of preference:
 *   1. Gemini 2.5 Flash Image ("Nano Banana") — when GEMINI_API_KEY is set.
 *      Step images are generated image-to-image against the recipe's hero photo
 *      so the whole method reads as one consistent kitchen.
 *   2. Pollinations — fetched SERVER-SIDE (never from the visitor's browser,
 *      which its per-IP anonymous limit now throttles) with retry, and cached.
 *
 * Everything is generated server-side and stored in Blob, so the client never
 * talks to an image provider directly. Nothing here throws to the request path;
 * on total failure the resolver returns null and the caller shows a placeholder.
 */

const GEMINI_TIMEOUT_MS = 40_000;
const POLLINATIONS_TIMEOUT_MS = 35_000;
const MAX_REFERENCE_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const DEFAULT_SIZE = { width: 600, height: 400 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The Vercel Blob read/write token. Normally `BLOB_READ_WRITE_TOKEN`, but when a
 * store is connected with a custom env-var prefix Vercel names it
 * `<PREFIX>_BLOB_READ_WRITE_TOKEN` — the SDK only auto-reads the unprefixed
 * name, so we detect either and pass it explicitly.
 */
export function blobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const key = Object.keys(process.env).find((k) => k.endsWith('BLOB_READ_WRITE_TOKEN'));
  return key ? process.env[key] : undefined;
}

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
interface Generated {
  buffer: Buffer;
  mime: string;
}
interface Size {
  width: number;
  height: number;
}

// ─── Gemini (Nano Banana) ────────────────────────────────────────────────────

async function generateWithGemini(prompt: string, reference?: InlineImage): Promise<Generated | null> {
  const key = config.geminiApiKey;
  if (!key) return null;

  const parts: unknown[] = [];
  if (reference) parts.push({ inlineData: { mimeType: reference.mime, data: reference.data } });
  parts.push({ text: prompt });

  // Attempt 1: richest request (explicit IMAGE modality + a wide 4:3 frame).
  // Attempt 2: the canonical bare Nano-Banana request, which is proven to return
  // an image. We fall back if the API version rejects the config OR returns no
  // image part — so a version quirk can never silently disable Gemini.
  const first = await callGemini(key, parts, { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:3' } });
  if (first !== 'retry') return first;
  const second = await callGemini(key, parts, undefined);
  return second === 'retry' ? null : second;
}

type GeminiResult = Generated | null | 'retry';

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
      // A 400 while sending the optional config → retry the bare request instead.
      if (res.status === 400 && generationConfig) return 'retry';
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
    // 200 but no image part — retry the bare request once before giving up.
    if (generationConfig) return 'retry';
    logger.warn('Gemini image response contained no image part');
    return null;
  } catch (err) {
    logger.warn({ err: String(err) }, 'Gemini image generation errored');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Pollinations (server-side, cached) ──────────────────────────────────────

async function generateFromPollinations(prompt: string, size: Size, seed: number): Promise<Generated | null> {
  let url = pollinationsUrl(prompt, size.width, size.height, seed);
  if (config.pollinationsToken) url += `&token=${encodeURIComponent(config.pollinationsToken)}`;
  if (config.pollinationsReferrer) url += `&referrer=${encodeURIComponent(config.pollinationsReferrer)}`;

  // The anonymous tier allows very little concurrency per IP; retry 429s with backoff.
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), POLLINATIONS_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: config.pollinationsReferrer ? { Referer: `https://${config.pollinationsReferrer}` } : {},
      });
      if (res.status === 429) {
        await sleep(1200 * (attempt + 1));
        continue;
      }
      const ct = (res.headers.get('content-type') || '').split(';')[0]!.trim();
      if (!res.ok || !ct.startsWith('image/')) {
        logger.warn({ status: res.status, ct }, 'Pollinations image request failed');
        return null;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      return { buffer, mime: EXT[ct] ? ct : 'image/jpeg' };
    } catch (err) {
      logger.warn({ err: String(err) }, 'Pollinations image generation errored');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

// ─── Blob storage + cache ────────────────────────────────────────────────────

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

async function uploadAndCache(cacheKey: string, img: Generated, provider: string): Promise<string> {
  const ext = EXT[img.mime] ?? 'png';
  const { url } = await put(`ember/gen/${crypto.randomBytes(16).toString('hex')}.${ext}`, img.buffer, {
    access: 'public',
    contentType: img.mime,
    token: blobToken(),
  });
  // If two requests raced, the first winner's URL stays; ours is a harmless orphan.
  await query(
    `INSERT INTO generated_images (cache_key, url, provider) VALUES ($1, $2, $3)
     ON CONFLICT (cache_key) DO NOTHING`,
    [cacheKey, url, provider],
  );
  const row = await queryOne<{ url: string }>(`SELECT url FROM generated_images WHERE cache_key = $1`, [cacheKey]);
  return row?.url ?? url;
}

async function getCached(cacheKey: string): Promise<string | null> {
  const hit = await queryOne<{ url: string }>(`SELECT url FROM generated_images WHERE cache_key = $1`, [cacheKey]);
  return hit?.url ?? null;
}

// ─── Public resolvers ────────────────────────────────────────────────────────

/**
 * One-shot live check that the Gemini image API is reachable and returns an
 * image with the configured key/model. Does not upload or cache. For admin
 * diagnostics only.
 */
export async function testGeminiImage(): Promise<{ ok: boolean; detail: string }> {
  if (!config.geminiEnabled) return { ok: false, detail: 'GEMINI_API_KEY is not set' };
  try {
    const img = await generateWithGemini('a single red apple on a white plate, simple food photography');
    return img
      ? { ok: true, detail: `ok — received ${img.mime}, ${img.buffer.byteLength.toLocaleString()} bytes` }
      : { ok: false, detail: 'no image returned — see function logs for the Gemini error/status' };
  } catch (err) {
    return { ok: false, detail: String(err).slice(0, 200) };
  }
}

/** Live check that Vercel Blob is connected and writable. For admin diagnostics. */
export async function testBlobWrite(): Promise<{ ok: boolean; detail: string }> {
  if (!blobToken()) {
    return { ok: false, detail: 'No *BLOB_READ_WRITE_TOKEN found — connect a Vercel Blob store to this project and redeploy' };
  }
  try {
    const { url } = await put(`ember/diag-${crypto.randomBytes(6).toString('hex')}.txt`, 'ok', {
      access: 'public',
      contentType: 'text/plain',
      token: blobToken(),
    });
    return { ok: true, detail: `wrote ${url}` };
  } catch (err) {
    const msg = String(err);
    const hint = /private|access/i.test(msg)
      ? ' — this looks like a PRIVATE Blob store; create a PUBLIC one (access mode cannot be changed after creation) and reconnect'
      : '';
    return { ok: false, detail: msg.slice(0, 200) + hint };
  }
}

/** Return a cached Blob URL for `cacheKey` without generating anything. */
export async function peekCachedImage(cacheKey: string): Promise<string | null> {
  try {
    await ensureTable();
    return await getCached(cacheKey);
  } catch {
    return null;
  }
}

/**
 * Resolve a durable text-to-image URL for `cacheKey` (recipe hero): cache hit →
 * Gemini → server-side Pollinations → null. Always returns a Blob URL or null.
 */
export async function resolveGeneratedImage(cacheKey: string, prompt: string, size: Size = DEFAULT_SIZE): Promise<string | null> {
  try {
    await ensureTable();
    const hit = await getCached(cacheKey);
    if (hit) return hit;

    let img: Generated | null = null;
    let provider = 'gemini';
    if (config.geminiEnabled) img = await generateWithGemini(prompt);
    if (!img) {
      img = await generateFromPollinations(prompt, size, hashId(cacheKey));
      provider = 'pollinations';
    }
    if (!img) return null;
    return await uploadAndCache(cacheKey, img, provider);
  } catch (err) {
    logger.warn({ err: String(err), cacheKey }, 'resolveGeneratedImage failed');
    return null;
  }
}

/**
 * Resolve a step image, generated image-to-image against the recipe's hero
 * photo (via Gemini) so the series stays visually consistent. Falls back to
 * server-side Pollinations, then null.
 */
export async function resolveStepImage(params: {
  cacheKey: string;
  stepPrompt: string;
  anchorCacheKey: string;
  anchorPrompt: string;
}): Promise<string | null> {
  try {
    await ensureTable();
    const hit = await getCached(params.cacheKey);
    if (hit) return hit;

    let img: Generated | null = null;
    let provider = 'gemini';
    if (config.geminiEnabled) {
      // Lock the visual style to the recipe's hero dish photo.
      let reference: InlineImage | null = null;
      const anchorUrl = await resolveGeneratedImage(params.anchorCacheKey, params.anchorPrompt);
      if (anchorUrl) reference = await fetchAsInline(anchorUrl);
      const prompt = reference
        ? `${params.stepPrompt}\n\nUse the attached reference photo as the fixed scene: keep the EXACT same kitchen, countertop surface, cookware, dishware, color palette and lighting so this reads as one step in a consistent step-by-step series. Only the food's state and the action shown should change to depict this step.`
        : params.stepPrompt;
      img = await generateWithGemini(prompt, reference ?? undefined);
    }
    if (!img) {
      img = await generateFromPollinations(params.stepPrompt, { width: 512, height: 340 }, hashId(params.cacheKey));
      provider = 'pollinations';
    }
    if (!img) return null;
    return await uploadAndCache(params.cacheKey, img, provider);
  } catch (err) {
    logger.warn({ err: String(err), cacheKey: params.cacheKey }, 'resolveStepImage failed');
    return null;
  }
}
