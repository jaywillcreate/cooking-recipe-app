import { z } from 'zod';
import { route, requireUser, readBody, json, notFound } from '@/lib/server/http';
import { query, queryOne } from '@/lib/server/db';
import { CUISINES, DIETS, SKILLS, TIMES, GOALS } from '@/lib/server/recipeSchema';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const GET = route(async (req: NextRequest) => {
  const u = requireUser(req);
  const p = await queryOne(
    `SELECT p.name, u.email, p.email_daily AS "emailDaily", p.cuisines, p.diets, p.allergies,
            p.skill, p.time_budget AS "time", p.goal, p.onboarded, p.avatar_url AS "avatarUrl",
            p.daily_on_hand AS "dailyOnHand", p.timezone, p.kid_friendly AS "kidFriendly",
            (u.password_hash IS NOT NULL) AS "hasPassword"
       FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1`,
    [u.id],
  );
  if (!p) throw notFound('Profile not found');
  return json({ profile: p, options: { CUISINES, DIETS, SKILLS, TIMES, GOALS } });
});

const patchSchema = z
  .object({
    name: z.string().max(80),
    emailDaily: z.boolean(),
    cuisines: z.array(z.string().max(30)).max(20),
    diets: z.array(z.string().max(30)).max(10),
    allergies: z.string().max(500),
    skill: z.enum(['Beginner', 'Comfortable', 'Adventurous']),
    time: z.enum(['15 min', '30 min', '45 min', '1 hr+']),
    goal: z.enum(['Balanced', 'High protein', 'Low calorie', 'Heart healthy', 'No goal']),
    onboarded: z.boolean(),
    dailyOnHand: z.string().max(500),
    timezone: z.string().max(64),
    kidFriendly: z.boolean(),
  })
  .partial();

const COLS: Record<string, string> = {
  name: 'name', emailDaily: 'email_daily', cuisines: 'cuisines', diets: 'diets', allergies: 'allergies',
  skill: 'skill', time: 'time_budget', goal: 'goal', onboarded: 'onboarded', dailyOnHand: 'daily_on_hand', timezone: 'timezone', kidFriendly: 'kid_friendly',
};

export const PATCH = route(async (req: NextRequest) => {
  const u = requireUser(req);
  const body = await readBody(req, patchSchema);
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, col] of Object.entries(COLS)) {
    if (k in body) {
      vals.push((body as Record<string, unknown>)[k]);
      sets.push(`${col} = $${vals.length}`);
    }
  }
  if (sets.length) {
    vals.push(u.id);
    await query(`UPDATE profiles SET ${sets.join(', ')} WHERE user_id = $${vals.length}`, vals);
  }
  return json({ ok: true });
});
