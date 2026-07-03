import { z } from 'zod';
import { route, requireUser, readBody, json, badRequest, notFound } from '@/lib/server/http';
import { queryOne } from '@/lib/server/db';
import { serializeRecipeForUser } from '@/lib/server/services/recipes';
import { assertRateLimit } from '@/lib/server/services/rateLimit';
import { sendEmail, renderRecipeEmail, emailConfigured, type EmailableRecipe } from '@/lib/server/services/email';
import { config } from '@/lib/server/config';
import { logger } from '@/lib/server/logger';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const schema = z.object({
  to: z.string().min(3).max(400), // comma/space/semicolon-separated recipients
  note: z.string().max(500).optional().default(''),
});

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_RECIPIENTS = 5;

export const POST = route(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const u = requireUser(req);
  const recipeId = z.string().uuid().safeParse(ctx.params.id);
  if (!recipeId.success) throw notFound('Recipe not found');

  // Cap outbound email per user so this can't be used as a spam relay.
  await assertRateLimit(`email:${u.id}`, 20, 86400, 'Daily email limit reached. Try again tomorrow.');

  const { to, note } = await readBody(req, schema);
  const recipients = Array.from(
    new Set(to.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)),
  );
  if (recipients.length === 0) throw badRequest('Enter at least one email address.');
  if (recipients.length > MAX_RECIPIENTS) throw badRequest(`You can email up to ${MAX_RECIPIENTS} people at once.`);
  const invalid = recipients.filter((e) => !EMAIL_RE.test(e));
  if (invalid.length) throw badRequest(`Not a valid email: ${invalid[0]}`);

  const r = await serializeRecipeForUser(u.id, recipeId.data);
  if (!r) throw notFound('Recipe not found');

  const sender = await queryOne<{ name: string; email: string }>(
    `SELECT p.name, u.email FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1`,
    [u.id],
  );

  const recipe: EmailableRecipe = {
    title: String(r.title),
    cuisine: String(r.cuisine),
    time: String(r.time),
    desc: String(r.desc),
    ingredients: (r.ingredients as string[]) ?? [],
    steps: (r.steps as string[]) ?? [],
    image: (r.photo as string | null) ?? placeholderImage(String(r.cuisine), recipeId.data),
  };
  const viewUrl = `${config.appOrigin}/recipe/${recipeId.data}`;
  const mail = renderRecipeEmail(recipe, sender?.name ?? '', note, viewUrl);

  let sent = 0;
  for (const addr of recipients) {
    try {
      await sendEmail({ to: addr, ...mail, replyTo: sender?.email });
      sent++;
    } catch (err) {
      logger.error({ err: String(err), addr }, 'Recipe email send failed');
    }
  }
  if (sent === 0) throw badRequest('Could not send the email right now — try again in a moment.');

  return json({ sent, recipients: recipients.length, delivered: emailConfigured() });
});

/** Same food-photo placeholder the UI uses, computed server-side for the email. */
function placeholderImage(cuisine: string, id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const kw = encodeURIComponent(`${cuisine.toLowerCase().replace(/[^a-z]/g, '')},food`);
  return `https://loremflickr.com/600/400/${kw}?lock=${h % 100000}`;
}
