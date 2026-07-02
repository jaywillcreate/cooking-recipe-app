import { route, requireUser, json, HttpError } from '@/lib/server/http';
import { assertUnderDailyLimit } from '@/lib/server/services/usage';
import { assertRateLimit } from '@/lib/server/services/rateLimit';
import { generateDailyFor } from '@/lib/server/services/daily';
import { serializeRecipeForUser } from '@/lib/server/services/recipes';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = route(async (req: NextRequest) => {
  const u = requireUser(req);
  await assertRateLimit('gen:global', 60, 60, 'The kitchen is busy — try again shortly.');
  await assertUnderDailyLimit(u.id);
  const force = req.nextUrl.searchParams.get('force') === '1' || req.nextUrl.searchParams.get('force') === 'true';
  try {
    const { recipe, alreadyExisted } = await generateDailyFor(u.id, { force, sendMail: false });
    return json({ recipe: await serializeRecipeForUser(u.id, recipe.id), alreadyExisted }, 201);
  } catch (err) {
    if ((err as Error).message === 'profile_not_found') throw new HttpError(404, 'Profile not found');
    throw new HttpError(502, "Couldn't generate today's recipe — try again shortly.", 'generation_failed');
  }
});
