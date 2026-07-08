import 'server-only';
import { query, queryOne, tx } from '../db';
import { logger } from '../logger';
import { config } from '../config';
import { generateRecipe, type ProfileForPrompt } from './ai';
import { insertGeneratedRecipe } from './recipes';
import { sendEmail, renderDailyEmail } from './email';
import { buildPreferenceHints, combineAllergies } from './personalization';
import type { GeneratedRecipe } from '../recipeSchema';

interface ProfileRow extends ProfileForPrompt {
  user_id: string;
  name: string;
  email: string;
  email_daily: boolean;
  time_budget: string;
  daily_on_hand: string;
  timezone: string;
  kid_friendly: boolean;
  daily_hour: number;
  allergens: string[];
}

function localDate(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(new Date());
  }
}

function localHour(timezone: string): number {
  try {
    return parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(new Date()),
      10,
    ) % 24;
  } catch {
    return new Date().getUTCHours();
  }
}

/** Generate (or regenerate) today's recipe for one user. Idempotent per date. */
export async function generateDailyFor(
  userId: string,
  opts: { force?: boolean; sendMail?: boolean } = {},
): Promise<{ recipe: GeneratedRecipe & { id: string; cuisine: string }; alreadyExisted: boolean }> {
  const profile = await queryOne<ProfileRow>(
    `SELECT p.user_id, p.name, u.email, p.email_daily, p.cuisines, p.diets, p.allergies,
            p.skill, p.time_budget, p.goal, p.daily_on_hand, p.timezone, p.kid_friendly,
            p.daily_hour, p.allergens
       FROM profiles p JOIN users u ON u.id = p.user_id
      WHERE p.user_id = $1 AND u.status = 'active'`,
    [userId],
  );
  if (!profile) throw new Error('profile_not_found');

  const forDate = localDate(profile.timezone);

  if (!opts.force) {
    const existing = await queryOne<{ recipe_id: string }>(`SELECT recipe_id FROM daily_recipes WHERE user_id = $1 AND for_date = $2`, [userId, forDate]);
    if (existing) {
      const r = await queryOne<RecipeShape>(`SELECT * FROM recipes WHERE id = $1`, [existing.recipe_id]);
      if (r) return { alreadyExisted: true, recipe: rowToRecipe(r) };
    }
  }

  const generated = await generateRecipe({
    kind: 'daily',
    userId,
    profile: { ...profile, allergies: combineAllergies(profile.allergies, profile.allergens) },
    hints: await buildPreferenceHints(userId),
    params: { purpose: 'daily personalized recipe of the day, surprise and delight', timeBudget: profile.time_budget, ingredientsUsuallyOnHand: profile.daily_on_hand || 'typical pantry', kidFriendly: profile.kid_friendly },
  });

  const recipeRow = await tx(async () => {
    const row = await insertGeneratedRecipe(userId, 'daily', generated);
    await query(
      `INSERT INTO daily_recipes (user_id, for_date, recipe_id) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, for_date) DO UPDATE SET recipe_id = EXCLUDED.recipe_id, emailed_at = NULL`,
      [userId, forDate, row.id],
    );
    return row;
  });

  const full = { ...generated, id: recipeRow.id, cuisine: recipeRow.cuisine };

  if (opts.sendMail && profile.email_daily && profile.email) {
    try {
      const viewUrl = `${config.appOrigin}/recipe/${recipeRow.id}`;
      const mail = renderDailyEmail(profile.name, full, viewUrl);
      await sendEmail({ to: profile.email, ...mail });
      await query(`UPDATE daily_recipes SET emailed_at = now() WHERE user_id = $1 AND for_date = $2`, [userId, forDate]);
    } catch (err) {
      logger.error({ err: String(err), userId }, 'Daily email send failed');
    }
  }
  return { recipe: full, alreadyExisted: false };
}

interface RecipeShape {
  id: string;
  title: string;
  cuisine: string;
  mins: number;
  time_label: string;
  difficulty: string;
  description: string;
  tags: string[];
  ingredients: string[];
  steps: string[];
  nutrition: Record<string, unknown>;
}
function rowToRecipe(r: RecipeShape): GeneratedRecipe & { id: string; cuisine: string } {
  return {
    id: r.id, title: r.title, cuisine: r.cuisine, mins: r.mins, time: r.time_label,
    difficulty: r.difficulty as GeneratedRecipe['difficulty'], desc: r.description,
    tags: r.tags, ingredients: r.ingredients, steps: r.steps, nutrition: r.nutrition as GeneratedRecipe['nutrition'],
  };
}

/**
 * Cron sweep: generate + email today's recipe for every user with daily email
 * on who doesn't yet have one for their local date. Idempotent — safe to run
 * on any schedule (a single daily Vercel Cron serves everyone once per day).
 */
export async function runDailySweep(): Promise<{ processed: number; candidates: number }> {
  const candidates = await query<{ user_id: string; timezone: string; daily_hour: number }>(
    `SELECT p.user_id, p.timezone, p.daily_hour FROM profiles p JOIN users u ON u.id = p.user_id
      WHERE p.email_daily = TRUE AND u.status = 'active'`,
  );
  let processed = 0;
  for (const c of candidates) {
    // Only deliver once the user's local time has reached their chosen hour.
    // With an hourly cron this fires exactly at that hour; with a once-daily
    // cron it delivers on the run at/after their preferred time.
    if (localHour(c.timezone) < (c.daily_hour ?? 8)) continue;
    const forDate = localDate(c.timezone);
    const done = await queryOne(`SELECT 1 FROM daily_recipes WHERE user_id = $1 AND for_date = $2 AND emailed_at IS NOT NULL`, [c.user_id, forDate]);
    if (done) continue;
    try {
      await generateDailyFor(c.user_id, { force: false, sendMail: true });
      processed++;
    } catch (err) {
      logger.error({ err: String(err), userId: c.user_id }, 'Daily sweep failed for user');
    }
  }
  logger.info({ processed, candidates: candidates.length }, 'Daily sweep complete');
  return { processed, candidates: candidates.length };
}
