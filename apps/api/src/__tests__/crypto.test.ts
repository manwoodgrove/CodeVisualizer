import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../auth/crypto.js';

describe('crypto utilities', () => {
  it('should encrypt and decrypt a string correctly', () => {
    const plainText = 'hello world';
    const encrypted = encrypt(plainText);
    expect(encrypted).not.toBe(plainText);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plainText);
  });

  it('should handle different string contents', () => {
    const cases = [
      '',
      '   ',
      '🚀 emoji test',
      'こんにちは',
      'A'.repeat(1000),
    ];

    for (const text of cases) {
      const encrypted = encrypt(text);
      expect(decrypt(encrypted)).toBe(text);
    }
  });

  it('should produce different ciphertexts for the same input (random IV)', () => {
    const plainText = 'constant input';
    const encrypted1 = encrypt(plainText);
    const encrypted2 = encrypt(plainText);

    expect(encrypted1).not.toBe(encrypted2);
    expect(decrypt(encrypted1)).toBe(plainText);
    expect(decrypt(encrypted2)).toBe(plainText);
  });

  describe('error handling', () => {
    it('should throw error for invalid base64', () => {
      // Not a valid base64 payload that can be split into IV/Tag/Ciphertext correctly
      expect(() => decrypt('not-base64!')).toThrow();
    });

    it('should throw error for too short payload', () => {
      const shortPayload = Buffer.from('too-short').toString('base64');
      expect(() => decrypt(shortPayload)).toThrow();
    });

    it('should throw error for tampered ciphertext', () => {
      const plainText = 'secret message';
      const encrypted = encrypt(plainText);
      const buf = Buffer.from(encrypted, 'base64');

      // Tamper with the ciphertext (last byte)
      buf[buf.length - 1] ^= 1;

      const tampered = buf.toString('base64');
      expect(() => decrypt(tampered)).toThrow();
    });

    it('should throw error for tampered auth tag', () => {
      const plainText = 'secret message';
      const encrypted = encrypt(plainText);
      const buf = Buffer.from(encrypted, 'base64');

      // IV is 12 bytes, Tag is 16 bytes. Tamper with a tag byte.
      buf[15] ^= 1;

      const tampered = buf.toString('base64');
      expect(() => decrypt(tampered)).toThrow();
    });

    it('should throw error for tampered IV', () => {
      const plainText = 'secret message';
      const encrypted = encrypt(plainText);
      const buf = Buffer.from(encrypted, 'base64');

      // Tamper with an IV byte (first 12 bytes)
      buf[0] ^= 1;

      const tampered = buf.toString('base64');
      expect(() => decrypt(tampered)).toThrow();
    });
  });
});
