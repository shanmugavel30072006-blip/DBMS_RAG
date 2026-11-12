// ============================================================================
// Authentication & Access
// - Passwords are never stored or compared in plain text (scrypt + salt).
// - Sessions are stateless HMAC-signed httpOnly cookies.
// ============================================================================

import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'crypto';

export interface CurrentUser {
  user_id: number;
  username: string;
  full_name: string;
  email: string;
  department: string;
}

export function isAdmin(user?: CurrentUser | null): boolean {
  if (!user) return false;
  return user.username.toLowerCase() === 'admin';
}

export interface SessionUser extends CurrentUser {}

// Universal access for all authenticated users
export function canIngestDocuments(_user?: unknown): boolean {
  return true;
}

export function canResolveAnomalies(_user?: unknown): boolean {
  return true;
}

// ---- PASSWORD HASHING (scrypt) ----
// Stored format: scrypt$<saltHex>$<derivedKeyHex>
const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, KEY_LEN).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  // Reject legacy/plain-text rows so they can never authenticate silently.
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  try {
    const actual = scryptSync(password, salt, KEY_LEN);
    const expected = Buffer.from(expectedHex, 'hex');
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ---- HMAC SESSION TOKENS ----
function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 characters.');
  return secret;
}
export const SESSION_COOKIE = 'astrorag_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function createSessionToken(userId: number): string {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: expiresAt })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined): number | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload);
  // Constant-time comparison on equal-length buffers
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid: number;
      exp: number;
    };
    if (!data.exp || data.exp < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;