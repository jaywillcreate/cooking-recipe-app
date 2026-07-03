import 'server-only';
import { config } from '../config';
import { logger } from '../logger';
import type { GeneratedRecipe } from '../recipeSchema';

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/** Whether real email delivery is configured (else it just logs). */
export const emailConfigured = (): boolean =>
  (config.emailProvider === 'resend' && !!config.resendApiKey) ||
  (config.emailProvider === 'brevo' && !!config.brevoApiKey);

/** Parse `EMAIL_FROM` ("Name <email>" or "email") into parts. */
function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || 'Ember', email: m[2]!.trim() };
  return { name: 'Ember', email: from.trim() };
}

/**
 * Provider-agnostic email.
 *  - `console` logs only (dev / not configured)
 *  - `resend`  HTTP API (requires a verified domain)
 *  - `brevo`   HTTP API (works with a single verified sender email — no domain)
 */
export async function sendEmail(args: SendArgs): Promise<void> {
  if (config.emailProvider === 'brevo') {
    if (!config.brevoApiKey) throw new Error('BREVO_API_KEY missing');
    const sender = parseFrom(config.emailFrom);
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': config.brevoApiKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender,
        to: [{ email: args.to }],
        subject: args.subject,
        htmlContent: args.html,
        textContent: args.text,
        ...(args.replyTo ? { replyTo: { email: args.replyTo } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Brevo failed: ${res.status} ${await res.text()}`);
    return;
  }

  if (config.emailProvider === 'resend') {
    if (!config.resendApiKey) throw new Error('RESEND_API_KEY missing');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: config.emailFrom,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
        ...(args.replyTo ? { reply_to: args.replyTo } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
    return;
  }

  logger.info({ to: args.to, subject: args.subject }, '[email:console] (not actually sent — set EMAIL_PROVIDER=brevo)');
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function renderDailyEmail(
  name: string,
  recipe: GeneratedRecipe & { cuisine: string },
  viewUrl: string,
): { subject: string; html: string; text: string } {
  const ingredients = recipe.ingredients.map((i) => `<li>${esc(i)}</li>`).join('');
  const steps = recipe.steps.map((s, i) => `<li><b>${i + 1}.</b> ${esc(s)}</li>`).join('');
  const hi = name ? `Good morning, ${esc(name)}` : 'Good morning';
  const html = `<!doctype html><html><body style="margin:0;background:#faf5ec;font-family:Archivo,Helvetica,Arial,sans-serif;color:#241a12">
  <div style="max-width:560px;margin:0 auto;padding:28px">
    <div style="font-weight:900;letter-spacing:-.5px;font-size:20px">EMBER<span style="color:#c4552d">.</span></div>
    <p style="color:rgba(36,26,18,.65);font-size:13px;margin:6px 0 20px">${hi} — today's creation, invented just for you.</p>
    <div style="background:#241a12;color:#fff;border-radius:16px;padding:24px">
      <div style="color:#e8a13c;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px">${esc(recipe.cuisine)} · ${esc(recipe.time || recipe.mins + ' min')}</div>
      <h1 style="font-size:26px;margin:8px 0 6px;font-weight:800">${esc(recipe.title)}</h1>
      <p style="color:rgba(255,255,255,.75);font-size:14px;margin:0">${esc(recipe.desc)}</p>
      <a href="${esc(viewUrl)}" style="display:inline-block;margin-top:16px;background:#c4552d;color:#fff;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:700;font-size:13px">View full recipe →</a>
    </div>
    <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#9a6a10;margin:24px 0 8px">Ingredients</h3>
    <ul style="font-size:14px;line-height:1.7;padding-left:18px;margin:0">${ingredients}</ul>
    <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#9a6a10;margin:24px 0 8px">Method</h3>
    <ol style="font-size:14px;line-height:1.7;padding-left:18px;margin:0;list-style:none">${steps}</ol>
    <p style="color:rgba(36,26,18,.5);font-size:11px;margin-top:28px">You're receiving this because daily delivery is on. Manage it in your Ember daily settings.</p>
  </div></body></html>`;
  const text =
    `${recipe.title} (${recipe.cuisine}, ${recipe.time || recipe.mins + ' min'})\n\n${recipe.desc}\n\n` +
    `INGREDIENTS\n- ${recipe.ingredients.join('\n- ')}\n\nMETHOD\n${recipe.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nView: ${viewUrl}`;
  return { subject: `☀️ Today's recipe: ${recipe.title}`, html, text };
}

export interface EmailableRecipe {
  title: string;
  cuisine: string;
  time: string;
  desc: string;
  ingredients: string[];
  steps: string[];
  image?: string | null;
}

/** A "someone shared a recipe with you" email. */
export function renderRecipeEmail(
  recipe: EmailableRecipe,
  fromName: string,
  note: string,
  viewUrl: string,
): { subject: string; html: string; text: string } {
  const ingredients = recipe.ingredients.map((i) => `<li>${esc(i)}</li>`).join('');
  const steps = recipe.steps.map((s, i) => `<li><b>${i + 1}.</b> ${esc(s)}</li>`).join('');
  const who = fromName ? esc(fromName) : 'Someone';
  const hero = recipe.image
    ? `<img src="${esc(recipe.image)}" alt="" style="width:100%;height:200px;object-fit:cover;border-radius:14px;margin-bottom:16px" />`
    : '';
  const noteBlock = note
    ? `<div style="background:#faf5ec;border-radius:12px;padding:14px 16px;font-size:14px;font-style:italic;margin:0 0 18px">“${esc(note)}”</div>`
    : '';

  const html = `<!doctype html><html><body style="margin:0;background:#faf5ec;font-family:Archivo,Helvetica,Arial,sans-serif;color:#241a12">
  <div style="max-width:560px;margin:0 auto;padding:28px">
    <div style="font-weight:900;letter-spacing:-.5px;font-size:20px">EMBER<span style="color:#c4552d">.</span></div>
    <p style="color:rgba(36,26,18,.65);font-size:13px;margin:6px 0 20px">${who} shared a recipe with you.</p>
    ${noteBlock}
    ${hero}
    <div style="color:#c4552d;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px">${esc(recipe.cuisine)} · ${esc(recipe.time)}</div>
    <h1 style="font-size:26px;margin:6px 0 6px;font-weight:800">${esc(recipe.title)}</h1>
    <p style="color:rgba(36,26,18,.7);font-size:14px;margin:0 0 8px">${esc(recipe.desc)}</p>
    <a href="${esc(viewUrl)}" style="display:inline-block;margin-top:8px;background:#c4552d;color:#fff;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:700;font-size:13px">Open in Ember →</a>
    <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#9a6a10;margin:24px 0 8px">Ingredients</h3>
    <ul style="font-size:14px;line-height:1.7;padding-left:18px;margin:0">${ingredients}</ul>
    <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#9a6a10;margin:24px 0 8px">Method</h3>
    <ol style="font-size:14px;line-height:1.7;padding-left:18px;margin:0;list-style:none">${steps}</ol>
  </div></body></html>`;

  const text =
    `${who} shared a recipe with you.\n${note ? '\n"' + note + '"\n' : ''}\n` +
    `${recipe.title} (${recipe.cuisine}, ${recipe.time})\n\n${recipe.desc}\n\n` +
    `INGREDIENTS\n- ${recipe.ingredients.join('\n- ')}\n\nMETHOD\n${recipe.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nOpen: ${viewUrl}`;

  return { subject: `${who} shared: ${recipe.title}`, html, text };
}
