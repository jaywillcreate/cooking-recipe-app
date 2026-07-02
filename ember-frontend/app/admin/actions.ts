'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { query, queryOne } from '@/lib/server/db';
import { verifyPassword } from '@/lib/server/services/auth';
import { readAdminSession, setAdminSession, clearAdminSession } from '@/lib/server/adminSession';

async function audit(actorId: string | null, action: string, target: string | null, detail: object) {
  await query(`INSERT INTO audit_log (actor_id, action, target, detail) VALUES ($1,$2,$3,$4)`, [
    actorId,
    action,
    target,
    JSON.stringify(detail),
  ]).catch(() => undefined);
}

export async function adminLogin(formData: FormData): Promise<void> {
  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(1) })
    .safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) redirect('/admin/login?error=1');

  const user = await queryOne<{ id: string; email: string; password_hash: string; role: string; status: string }>(
    `SELECT id, email, password_hash, role, status FROM users WHERE email = $1`,
    [parsed.data.email],
  );
  const ok = user ? await verifyPassword(user.password_hash, parsed.data.password) : false;
  if (!user || !ok || user.role !== 'admin' || user.status !== 'active') {
    await audit(user?.id ?? null, 'admin_login_failed', parsed.data.email, {});
    redirect('/admin/login?error=1');
  }
  setAdminSession({ sub: user.id, email: user.email });
  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);
  await audit(user.id, 'admin_login', user.email, {});
  redirect('/admin');
}

export async function adminLogout(): Promise<void> {
  clearAdminSession();
  redirect('/admin/login');
}

export async function setUserStatus(formData: FormData): Promise<void> {
  const session = readAdminSession();
  if (!session) redirect('/admin/login');
  const id = z.string().uuid().parse(formData.get('id'));
  const status = z.enum(['active', 'suspended']).parse(formData.get('status'));
  if (id === session.sub) return; // never suspend yourself
  await query(`UPDATE users SET status = $1 WHERE id = $2 AND role <> 'admin'`, [status, id]);
  await audit(session.sub, 'user_status_change', id, { status });
  revalidatePath('/admin/users');
}

export async function createRelease(formData: FormData): Promise<void> {
  const session = readAdminSession();
  if (!session) redirect('/admin/login');
  const parsed = z
    .object({
      version: z.string().trim().min(1).max(40),
      channel: z.enum(['production', 'staging', 'beta']),
      title: z.string().trim().min(1).max(160),
      notes: z.string().max(8000).optional().default(''),
    })
    .safeParse({
      version: formData.get('version'),
      channel: formData.get('channel'),
      title: formData.get('title'),
      notes: formData.get('notes') ?? '',
    });
  if (!parsed.success) redirect('/admin/releases?error=invalid');
  try {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO releases (version, channel, title, notes, released_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [parsed.data.version, parsed.data.channel, parsed.data.title, parsed.data.notes, session.sub],
    );
    await audit(session.sub, 'release_created', row!.id, { version: parsed.data.version, channel: parsed.data.channel });
  } catch {
    redirect('/admin/releases?error=duplicate');
  }
  revalidatePath('/admin/releases');
  redirect('/admin/releases');
}
