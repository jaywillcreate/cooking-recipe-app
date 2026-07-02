import { z } from 'zod';
import { route, requireUser, json } from '@/lib/server/http';
import { query } from '@/lib/server/db';
import { serializeRecipe, type RecipeRow } from '@/lib/server/services/recipes';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const GET = route(async (req: NextRequest) => {
  const u = requireUser(req);
  const sp = req.nextUrl.searchParams;
  const q = z.string().max(120).optional().parse(sp.get('q') || undefined);
  const cuisine = z.string().max(30).optional().parse(sp.get('cuisine') || undefined);
  const scope = z.enum(['discover', 'saved', 'web']).default('discover').parse(sp.get('scope') || 'discover');

  const where: string[] = ['(r.owner_id IS NULL OR r.owner_id = $1)'];
  const params: unknown[] = [u.id];

  if (scope === 'web') {
    where.push(`r.source IS NOT NULL AND EXISTS (SELECT 1 FROM followed_sites fs WHERE fs.user_id = $1 AND fs.domain = r.source)`);
  } else if (scope === 'discover' && !q) {
    where.push(`r.source IS NULL`);
  }
  if (scope === 'saved') where.push(`EXISTS (SELECT 1 FROM saves s WHERE s.user_id = $1 AND s.recipe_id = r.id)`);
  if (cuisine && cuisine !== 'All') {
    params.push(cuisine);
    where.push(`r.cuisine = $${params.length}`);
  }
  if (q) {
    params.push(q);
    const p = `$${params.length}`;
    where.push(
      `(to_tsvector('english', r.title || ' ' || r.cuisine || ' ' || array_to_string(r.tags,' ') || ' ' || array_to_string(r.ingredients,' ')) @@ plainto_tsquery('english', ${p})
        OR r.title ILIKE '%' || ${p} || '%')`,
    );
  }

  const rows = await query<RecipeRow & { saved: boolean; ctags: string[]; user_photo: string | null }>(
    `SELECT r.*,
            EXISTS (SELECT 1 FROM saves s WHERE s.user_id = $1 AND s.recipe_id = r.id) AS saved,
            COALESCE(array(SELECT tag FROM recipe_tags t WHERE t.user_id = $1 AND t.recipe_id = r.id), '{}') AS ctags,
            (SELECT url FROM recipe_photos rp WHERE rp.user_id = $1 AND rp.recipe_id = r.id) AS user_photo
       FROM recipes r
      WHERE ${where.join(' AND ')}
      ORDER BY r.created_at DESC, r.title ASC
      LIMIT 200`,
    params,
  );
  return json({ recipes: rows.map((r) => serializeRecipe(r, { saved: r.saved, customTags: r.ctags, userPhoto: r.user_photo })) });
});
