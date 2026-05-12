import crypto from 'node:crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT_LEN = 16;
const LEGACY_SALT = Buffer.from('cv-api-crypto-salt-v1');

// Cache the legacy key to avoid expensive scryptSync on every decryption fallback
let legacyKey: Buffer | null = null;
function getLegacyKey(): Buffer {
  if (!legacyKey) {
    legacyKey = crypto.scryptSync(config.sessionSecret, LEGACY_SALT, KEY_LEN);
  }
  return legacyKey;
}

/**
 * Derive a key using HKDF.
 */
function deriveKey(salt: Buffer): Buffer {
  return crypto.hkdfSync('sha256', config.sessionSecret, salt, '', KEY_LEN);
}

/**
 * Encrypt a plaintext string.
 * @returns base64(salt [16 bytes] | iv [12 bytes] | authTag [16 bytes] | ciphertext)
 */
export function encrypt(plain: string): string {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypt a payload produced by {@link encrypt}.
 * Supports fallback to legacy format (fixed salt).
 */
export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64');

  // Attempt decryption with new format (per-encryption salt)
  if (buf.length >= SALT_LEN + IV_LEN + TAG_LEN) {
    try {
      const salt = buf.subarray(0, SALT_LEN);
      const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
      const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
      const ciphertext = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN);
      const key = deriveKey(salt);

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // Fall through to legacy decryption
    }
  }

  // Fallback to legacy format (fixed salt)
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const key = getLegacyKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
