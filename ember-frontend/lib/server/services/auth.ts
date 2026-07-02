import 'server-only';
import crypto from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { query, queryOne } from '../db';

export type Role = 'user' | 'admin';
export interface AccessClaims {
  sub: string;
  role: Role;
}

// ─── Passwords (argon2id via @node-rs/argon2 — prebuilt, serverless-safe) ───
export function hashPassword(plain: string): Promise<string> {
  return argonHash(plain);
}
export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argonVerify(hash, plain).catch(() => false);
}

// ─── Access tokens (short-lived JWT) ────────────────────────────────────────
export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, config.jwtAccessSecret, { expiresIn: config.accessTtl as jwt.SignOptions['expiresIn'] });
}
export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, config.jwtAccessSecret) as AccessClaims;
}

// ─── Refresh tokens (opaque, hashed at rest, rotated on use) ─────────────────
const hashToken = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

export async function issueRefreshToken(userId: string, userAgent?: string): Promise<string> {
  const raw = crypto.randomBytes(48).toString('base64url');
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, now() + ($3 || ' days')::interval, $4)`,
    [userId, hashToken(raw), String(config.refreshTtlDays), userAgent?.slice(0, 300) ?? null],
  );
  return raw;
}

export async function rotateRefreshToken(
  raw: string,
  userAgent?: string,
): Promise<{ userId: string; role: Role; newRaw: string } | null> {
  const row = await queryOne<{ id: string; user_id: string; role: Role }>(
    `SELECT rt.id, rt.user_id, u.role
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
      WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > now() AND u.status = 'active'`,
    [hashToken(raw)],
  );
  if (!row) return null;
  await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [row.id]);
  const newRaw = await issueRefreshToken(row.user_id, userAgent);
  return { userId: row.user_id, role: row.role, newRaw };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1`, [hashToken(raw)]);
}
