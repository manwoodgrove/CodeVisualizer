import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../auth/crypto.js';

describe('crypto utilities', () => {
  describe('encrypt and decrypt', () => {
    it('should successfully roundtrip a standard string', () => {
      const plaintext = 'hello world';
      const encrypted = encrypt(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('should successfully roundtrip an empty string', () => {
      const plaintext = '';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('should successfully roundtrip a long string', () => {
      const plaintext = 'a'.repeat(1024 * 10); // 10KB
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('should successfully roundtrip a string with special characters', () => {
      const plaintext = '🔥🚀 Special Characters: \u1234 \n\t';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('should produce different ciphertexts for the same input (random IV)', () => {
      const plaintext = 'consistent message';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);
      expect(encrypted1).not.toBe(encrypted2);
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });
  });

  describe('error conditions', () => {
    it('should throw when decrypting tampered ciphertext', () => {
      const plaintext = 'secret message';
      const encrypted = encrypt(plaintext);
      const buf = Buffer.from(encrypted, 'base64');

      // Tamper with the ciphertext part (starts after IV [12] and TAG [16])
      buf[30] ^= 1;

      const tampered = buf.toString('base64');
      expect(() => decrypt(tampered)).toThrow();
    });

    it('should throw when decrypting tampered authentication tag', () => {
      const plaintext = 'secret message';
      const encrypted = encrypt(plaintext);
      const buf = Buffer.from(encrypted, 'base64');

      // Tamper with the tag part (IV is 12 bytes, TAG is 16 bytes)
      buf[15] ^= 1;

      const tampered = buf.toString('base64');
      expect(() => decrypt(tampered)).toThrow();
    });

    it('should throw when decrypting tampered IV', () => {
      const plaintext = 'secret message';
      const encrypted = encrypt(plaintext);
      const buf = Buffer.from(encrypted, 'base64');

      // Tamper with the IV part (first 12 bytes)
      buf[5] ^= 1;

      const tampered = buf.toString('base64');
      expect(() => decrypt(tampered)).toThrow();
    });

    it('should throw for input that is too short', () => {
      // IV(12) + TAG(16) = 28 bytes minimum for empty string ciphertext
      const tooShort = Buffer.from('too short').toString('base64');
      expect(() => decrypt(tooShort)).toThrow();
    });

    it('should throw for invalid base64 input', () => {
      // Note: Buffer.from with invalid base64 might just return what it can parse.
      // But decryption will definitely fail because it won't match expected formats/tags.
      const invalidBase64 = '!!! Not Base64 !!!';
      expect(() => decrypt(invalidBase64)).toThrow();
    });
  });
});
