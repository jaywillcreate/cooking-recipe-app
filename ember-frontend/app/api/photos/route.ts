import crypto from 'node:crypto';
import { z } from 'zod';
import { put } from '@vercel/blob';
import { route, requireUser, readBody, json, badRequest, notFound } from '@/lib/server/http';
import { query } from '@/lib/server/db';
import { getVisibleRecipe } from '@/lib/server/services/recipes';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 6 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const schema = z.object({
  dataUrl: z.string().max(9_000_000),
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('avatar') }),
    z.object({ kind: z.literal('recipe'), recipeId: z.string().uuid() }),
  ]),
});

/**
 * Validate a data-URL image and store it in Vercel Blob (durable, CDN-served).
 * Requires BLOB_READ_WRITE_TOKEN (auto-set once a Blob store is linked on Vercel).
 */
export const POST = route(async (req: NextRequest) => {
  const u = requireUser(req);
  const { dataUrl, target } = await readBody(req, schema);

  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw badRequest('Expected a base64 data URL');
  const ext = EXT[m[1]!];
  if (!ext) throw badRequest('Only JPEG, PNG or WebP images are allowed');

  const buf = Buffer.from(m[2]!, 'base64');
  if (buf.byteLength > MAX_BYTES) throw badRequest('Image exceeds 6 MB');
  if (!looksLikeImage(buf, m[1]!)) throw badRequest('File does not look like a valid image');

  const { url } = await put(`ember/${crypto.randomBytes(16).toString('hex')}.${ext}`, buf, {
    access: 'public',
    contentType: m[1]!,
  });

  if (target.kind === 'avatar') {
    await query(`UPDATE profiles SET avatar_url = $1 WHERE user_id = $2`, [url, u.id]);
  } else {
    if (!(await getVisibleRecipe(u.id, target.recipeId))) throw notFound('Recipe not found');
    await query(
      `INSERT INTO recipe_photos (user_id, recipe_id, url) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, recipe_id) DO UPDATE SET url = EXCLUDED.url, updated_at = now()`,
      [u.id, target.recipeId, url],
    );
  }
  return json({ url }, 201);
});

function looksLikeImage(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false;
  if (mime === 'image/png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/webp') return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return false;
}
