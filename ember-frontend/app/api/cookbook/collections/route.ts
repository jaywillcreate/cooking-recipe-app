import { z } from 'zod';
import { route, requireUser, readBody, json, badRequest } from '@/lib/server/http';
import { query, queryOne } from '@/lib/server/db';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const GET = route(async (req: NextRequest) => {
  const u = requireUser(req);
  const rows = await query(
    `SELECT c.id, c.name,
            COALESCE(array(SELECT recipe_id::text FROM collection_items ci WHERE ci.collection_id = c.id), '{}') AS "recipeIds"
       FROM collections c WHERE c.user_id = $1 ORDER BY c.created_at`,
    [u.id],
  );
  return json({ collections: rows });
});

export const POST = route(async (req: NextRequest) => {
  const u = requireUser(req);
  const { name } = await readBody(req, z.object({ name: z.string().trim().min(1).max(50) }));
  const row = await queryOne(
    `INSERT INTO collections (user_id, name) VALUES ($1,$2) ON CONFLICT (user_id, name) DO NOTHING RETURNING id, name`,
    [u.id, name],
  );
  if (!row) throw badRequest('You already have a collection with that name.');
  return json({ collection: { ...row, recipeIds: [] } }, 201);
});
