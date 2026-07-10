import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { queryOne } from '@/lib/server/db';
import { assertRateLimit } from '@/lib/server/services/rateLimit';
import { peekCachedImage, resolveGeneratedImage, testBlobWrite, blobToken } from '@/lib/server/services/images';
import { config } from '@/lib/server/config';
import { clientIp } from '@/lib/server/http';
import { recipeImagePrompt, hashId, accentFor } from '@/lib/tokens';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

const CACHE_VERSION = 'v2';

/**
 * Public image proxy for a recipe's dish photo. Browsers hit THIS (same-origin,
 * cookie-free, usable as <img src> or CSS background) instead of an image
 * provider directly — so the provider's per-IP rate limits never break a
 * gallery of thumbnails. Resolves to a cached Vercel Blob URL (302), generating
 * it once via Gemini / server-side Pollinations on a cache miss, and falls back
 * to a tinted placeholder so a card is never blank.
 *
 * Recipe images are non-sensitive (derived from the public title/cuisine, and
 * the underlying Blob URLs are public anyway), so this route is unauthenticated
 * — gated only by an IP rate limit. It never exposes user-uploaded photos.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }): Promise<Response> {
  // ?debug=1 reports the deployed image-pipeline state (no secret values) and
  // runs a live Blob write, so the exact failure is visible from the outside.
  if (req.nextUrl.searchParams.get('debug') === '1') {
    const blobTokenNames = Object.keys(process.env).filter((k) => k.endsWith('BLOB_READ_WRITE_TOKEN'));
    const allBlobEnvNames = Object.keys(process.env).filter((k) => /BLOB/i.test(k));
    const blobWriteTest = await testBlobWrite();
    return NextResponse.json({
      geminiEnabled: config.geminiEnabled,
      geminiModel: config.geminiImageModel,
      hasBlobToken: !!blobToken(),
      blobTokenCount: blobTokenNames.length,
      blobTokenNames,
      allBlobEnvNames,
      blobWriteTest,
    });
  }

  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return placeholder('American');

  try {
    const recipe = await queryOne<{ title: string; cuisine: string }>(
      `SELECT title, cuisine FROM recipes WHERE id = $1`,
      [id.data],
    );
    if (!recipe) return placeholder('American');

    const cacheKey = `recipe:${id.data}:${CACHE_VERSION}`;

    // Fast path: already generated → redirect straight to the CDN.
    const cached = await peekCachedImage(cacheKey);
    if (cached) return redirectToImage(cached);

    // Cache miss → generate once (rate-limited per IP as a spend/abuse guard).
    await assertRateLimit(`imgproxy:${clientIp(req)}`, 120, 3600, 'Image rate limit');
    const url = await resolveGeneratedImage(cacheKey, recipeImagePrompt(recipe.title, recipe.cuisine), {
      width: 600,
      height: 400,
    });
    return url ? redirectToImage(url) : placeholder(recipe.cuisine);
  } catch {
    return placeholder('American');
  }
}

/** 302 to the Blob URL, with a cached redirect so repeat views skip this route. */
function redirectToImage(url: string): Response {
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: url,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}

/** Deterministic cuisine-tinted gradient SVG shown when generation isn't available. */
function placeholder(cuisine: string): Response {
  const a = accentFor(cuisine);
  const seed = hashId(cuisine);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${a}" stop-opacity="0.55"/>
    </linearGradient></defs>
    <rect width="600" height="400" fill="#efe7d8"/>
    <rect width="600" height="400" fill="url(#g)"/>
    <circle cx="${120 + (seed % 360)}" cy="${80 + (seed % 240)}" r="140" fill="${a}" opacity="0.10"/>
  </svg>`;
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      // Short cache so it upgrades to the real image once one can be generated.
      'Cache-Control': 'public, max-age=300',
    },
  });
}
