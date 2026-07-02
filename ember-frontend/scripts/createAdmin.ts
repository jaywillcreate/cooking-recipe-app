import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { hash as argonHash } from '@node-rs/argon2';
import { pool } from './pool';

/**
 * Create (or promote) an admin.
 *   npm run create-admin -- admin@ember.app 'a-long-strong-password'
 * or run with no args for interactive prompts.
 */
async function main() {
  let email = process.argv[2];
  let password = process.argv[3];
  if (!email || !password) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    email = email || (await rl.question('Admin email: '));
    password = password || (await rl.question('Admin password (min 12 chars): '));
    rl.close();
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 12) {
    console.error('❌ Email must be valid and password ≥ 12 chars.');
    process.exit(1);
  }

  const passwordHash = await argonHash(password);
  const existing = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length) {
    const id = existing.rows[0]!.id;
    await pool.query(`UPDATE users SET role='admin', password_hash=$1, status='active' WHERE id=$2`, [passwordHash, id]);
    console.log(`✅ Promoted ${email} to admin and reset password.`);
  } else {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, email_verified) VALUES ($1,$2,'admin',TRUE) RETURNING id`,
      [email, passwordHash],
    );
    await pool.query(`INSERT INTO profiles (user_id, name) VALUES ($1,'Administrator')`, [inserted.rows[0]!.id]);
    console.log(`✅ Created admin ${email}.`);
  }
  await pool.end();
}
main().catch((err) => {
  console.error('❌ create-admin failed:', err);
  process.exit(1);
});
