import crypto from 'node:crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT = Buffer.from('cv-api-crypto-salt-v1'); // fixed salt; secret provides entropy

// Derive a stable 256-bit key from the session secret
const key = crypto.scryptSync(config.sessionSecret, SALT, KEY_LEN);

/**
 * Encrypt a plaintext string.
 * @returns base64(iv [12 bytes] | authTag [16 bytes] | ciphertext)
 */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypt a payload produced by {@link encrypt}.
 */
export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    'utf8'
  );
}
