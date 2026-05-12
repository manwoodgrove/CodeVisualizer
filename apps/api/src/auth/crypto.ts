import crypto from 'node:crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT_LEN = 16;

const V1_SALT = Buffer.from('cv-api-crypto-salt-v1');

// Stable key for legacy v1 decryption
const v1Key = crypto.scryptSync(config.sessionSecret, V1_SALT, KEY_LEN);

/**
 * Encrypt a plaintext string securely using a random salt.
 * @returns 'v2:' + base64(salt [16 bytes] | iv [12 bytes] | authTag [16 bytes] | ciphertext)
 */
export function encrypt(plain: string): string {
  const salt = crypto.randomBytes(SALT_LEN);
  const key = crypto.scryptSync(config.sessionSecret, salt, KEY_LEN);
  const iv = crypto.randomBytes(IV_LEN);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const payload = Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
  return `v2:${payload}`;
}

/**
 * Decrypt a payload produced by {@link encrypt}.
 * Automatically falls back to v1 decryption for older payloads.
 */
export function decrypt(payload: string): string {
  if (payload.startsWith('v2:')) {
    const buf = Buffer.from(payload.slice(3), 'base64');
    const salt = buf.subarray(0, SALT_LEN);
    const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
    const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
    const ciphertext = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN);

    const key = crypto.scryptSync(config.sessionSecret, salt, KEY_LEN);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  // Fallback to v1
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGORITHM, v1Key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
