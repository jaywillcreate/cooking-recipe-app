import { z } from 'zod';
import { route, requireUser, readBody, json, badRequest } from '@/lib/server/http';
import { queryOne } from '@/lib/server/db';
import { assertRateLimit } from '@/lib/server/services/rateLimit';
import { sendEmail, renderShoppingListEmail, emailConfigured } from '@/lib/server/services/email';
import { logger } from '@/lib/server/logger';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const schema = z.object({
  title: z.string().min(1).max(160),
  items: z.array(z.string().max(200)).min(1).max(60),
  to: z.string().max(400).optional().default(''),
});

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Email a shopping list — to yourself by default, or up to 5 people. */
export const POST = route(async (req: NextRequest) => {
  const u = requireUser(req);
  await assertRateLimit(`email:${u.id}`, 20, 86400, 'Daily email limit reached. Try again tomorrow.');

  const { title, items, to } = await readBody(req, schema);
  const me = await queryOne<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [u.id]);

  // Default to the user's own address when none supplied ("email my list").
  const raw = to.trim() ? to : me?.email ?? '';
  const recipients = Array.from(new Set(raw.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)));
  if (recipients.length === 0) throw badRequest('No email address on file — enter one.');
  if (recipients.length > 5) throw badRequest('You can email up to 5 people at once.');
  const invalid = recipients.filter((e) => !EMAIL_RE.test(e));
  if (invalid.length) throw badRequest(`Not a valid email: ${invalid[0]}`);

  const mail = renderShoppingListEmail(title, items);
  let sent = 0;
  let lastError = '';
  for (const addr of recipients) {
    try {
      await sendEmail({ to: addr, ...mail, replyTo: me?.email });
      sent++;
    } catch (err) {
      lastError = (err as Error).message;
      logger.error({ err: lastError, addr }, 'Shopping-list email failed');
    }
  }
  if (sent === 0) {
    const detail = u.role === 'admin' && lastError ? ` [${lastError}]` : '';
    throw badRequest(`Could not send the list right now — try again.${detail}`);
  }
  return json({ sent, recipients: recipients.length, delivered: emailConfigured() });
});
