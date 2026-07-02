import 'server-only';
import type { PoolClient } from 'pg';

interface ProvisionArgs {
  email: string;
  passwordHash?: string | null;
  googleId?: string | null;
  name?: string;
  avatarUrl?: string | null;
}

/**
 * Create a user + default profile, collections, and followed sites, atomically.
 * Shared by email/password register and Google sign-in. `emailVerified` is true
 * when created via Google (Google vouches for the address).
 */
export async function provisionUser(client: PoolClient, args: ProvisionArgs): Promise<string> {
  const user = await client.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, google_id, email_verified)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [args.email, args.passwordHash ?? null, args.googleId ?? null, !!args.googleId],
  );
  const id = user.rows[0]!.id;
  await client.query(
    `INSERT INTO profiles (user_id, name, cuisines, skill, time_budget, goal, avatar_url)
     VALUES ($1,$2,ARRAY['Japanese','Italian'],'Comfortable','30 min','Balanced',$3)`,
    [id, args.name ?? '', args.avatarUrl ?? null],
  );
  for (const c of ['Weeknight', 'Want to try', 'Baking']) {
    await client.query(`INSERT INTO collections (user_id, name) VALUES ($1,$2)`, [id, c]);
  }
  for (const d of ['halfbakedharvest.com', 'pinchofyum.com', 'sallysbakingaddiction.com']) {
    await client.query(`INSERT INTO followed_sites (user_id, domain) VALUES ($1,$2)`, [id, d]);
  }
  return id;
}
