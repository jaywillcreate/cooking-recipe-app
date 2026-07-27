import { hash as argonHash } from '@node-rs/argon2';
import { pool } from './pool';

// Mirror lib/server/services/auth.ts hashPassword (argon2id defaults). Imported
// directly here because that module pulls in `server-only`, which throws outside
// Next.js. Login verifies from the hash's encoded params, so this stays compatible.
const hashPassword = (plain: string) => argonHash(plain);

/**
 * Reset a user's password. Usage:
 *   npm run reset-password -- <email> <newPassword>
 * Requires DATABASE_URL (in .env.local). Sets password_hash and reactivates the
 * account; the user should change it again in Profile after logging in.
 */
async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  if (!email || !password) {
    console.error('Usage: npm run reset-password -- <email> <newPassword>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const hash = await hashPassword(password);
  const res = await pool.query(
    `UPDATE users SET password_hash = $1, status = 'active', updated_at = now()
     WHERE email = $2 RETURNING id, email, role`,
    [hash, email],
  );

  if (res.rowCount === 0) {
    console.error(`\n❌ No user found with email "${email}". Accounts in this database:`);
    const all = await pool.query(
      `SELECT email, role, (password_hash IS NOT NULL) AS has_password, (google_id IS NOT NULL) AS via_google
         FROM users ORDER BY created_at LIMIT 25`,
    );
    console.table(all.rows);
    await pool.end();
    process.exit(1);
  }

  console.log('\n✅ Password reset for:', res.rows[0]);
  console.log('   Log in with the new password, then change it in Profile → password.');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
