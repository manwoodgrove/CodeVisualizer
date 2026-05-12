import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../crypto.js';
import crypto from 'node:crypto';
import { config } from '../../config.js';

describe('crypto', () => {
  it('should encrypt and decrypt a string with new format', () => {
    const plain = 'hello-world';
    const encrypted = encrypt(plain);
    expect(encrypted).not.toBe(plain);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plain);
  });

  it('should produce different ciphertexts for the same plaintext', () => {
    const plain = 'hello-world';
    const encrypted1 = encrypt(plain);
    const encrypted2 = encrypt(plain);
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('should decrypt legacy format (scryptSync with fixed salt)', () => {
    // Manually create a legacy encrypted payload
    const plain = 'legacy-secret';
    const LEGACY_SALT = Buffer.from('cv-api-crypto-salt-v1');
    const KEY_LEN = 32;
    const ALGORITHM = 'aes-256-gcm';
    const IV_LEN = 12;

    const key = crypto.scryptSync(config.sessionSecret, LEGACY_SALT, KEY_LEN);
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, tag, encrypted]).toString('base64');

    const decrypted = decrypt(payload);
    expect(decrypted).toBe(plain);
  });

  it('should throw error for invalid payload', () => {
    expect(() => decrypt('invalid-base64')).toThrow();
    // A payload that is too short to be the new format AND too short to be the old format
    // IV (12) + Tag (16) = 28 bytes.
    expect(() => decrypt(Buffer.from('too-short').toString('base64'))).toThrow();
  });
});
