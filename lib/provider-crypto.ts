// ============================================================================
// Secure Cryptographic Storage & Hashing for Model Provider API Keys
// - Raw keys are NEVER logged, returned via API, or displayed in plaintext.
// - Keys are hashed with SHA-256 for cryptographic fingerprinting and verification.
// - Keys are encrypted at rest with authenticated AES-256-GCM using SESSION_SECRET.
// - Only the backend in-flight during an active Gemini call decrypts the key.
// ============================================================================

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function getEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters for key encryption.');
  }
  // Deterministically derive a 256-bit (32-byte) key specifically for provider key encryption
  return createHash('sha256').update(`${secret}:astrorag_provider_encryption_salt`).digest();
}

/**
 * Computes a standard SHA-256 hash of the API key for audit fingerprinting.
 * This is a one-way hash that can be stored and compared without exposing the key.
 */
export function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey.trim()).digest('hex');
}

/**
 * Returns a masked representation of the key for display purposes only.
 * E.g., 'AIzaSyD-1234567890abcdef' -> 'AIza••••••••••••••••cdef'
 * Neither users nor administrators can view the full unmasked key.
 */
export function maskKey(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (trimmed.length <= 8) {
    return '••••••••••••••••';
  }
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••••••••••••••${suffix}`;
}

/**
 * Encrypts an API key using AES-256-GCM (authenticated encryption with 12-byte IV).
 * Stored format: ivHex:authTagHex:ciphertextHex
 */
export function encryptKey(rawKey: string): string {
  const masterKey = getEncryptionKey();
  const iv = randomBytes(12); // Standard 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv);

  const ciphertext = Buffer.concat([cipher.update(rawKey.trim(), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 128-bit authentication tag

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM encrypted API key payload.
 * Throws if authentication tag verification fails (tampered data).
 */
export function decryptKey(payload: string): string {
  if (!payload || !payload.includes(':')) {
    throw new Error('Invalid encrypted key payload format.');
  }

  const [ivHex, authTagHex, cipherHex] = payload.split(':');
  if (!ivHex || !authTagHex || !cipherHex) {
    throw new Error('Malformed encrypted key components.');
  }

  const masterKey = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(cipherHex, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
