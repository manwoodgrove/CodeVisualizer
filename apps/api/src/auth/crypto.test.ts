import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './crypto.js';
import crypto from 'node:crypto';
import { config } from '../config.js';

describe('crypto', () => {
  it('should encrypt and decrypt correctly with v2 format', () => {
    const plain = 'super-secret-token-123';
    const encrypted = encrypt(plain);

    expect(encrypted.startsWith('v2:')).toBe(true);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plain);
  });

  it('should generate different ciphertexts for the same plaintext due to random salt', () => {
    const plain = 'super-secret-token-123';
    const encrypted1 = encrypt(plain);
    const encrypted2 = encrypt(plain);

    expect(encrypted1).not.toBe(encrypted2);
  });

  it('should fallback to v1 decryption for old payloads', () => {
    // Generate a v1 payload manually using the v1 logic
    const ALGORITHM = 'aes-256-gcm';
    const KEY_LEN = 32;
    const IV_LEN = 12;
    const V1_SALT = Buffer.from('cv-api-crypto-salt-v1');
    const v1Key = crypto.scryptSync(config.sessionSecret, V1_SALT, KEY_LEN);

    const plain = 'legacy-secret-token-456';
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGORITHM, v1Key, iv);
    const encryptedBuffer = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    const oldPayload = Buffer.concat([iv, tag, encryptedBuffer]).toString('base64');

    // Now decrypt it using our updated decrypt function
    const decrypted = decrypt(oldPayload);
    expect(decrypted).toBe(plain);
  });
});
