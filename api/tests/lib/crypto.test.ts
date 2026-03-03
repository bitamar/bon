import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encrypt, decrypt } from '../../src/lib/crypto.js';

// A valid 32-byte key, hex-encoded (64 chars)
const TEST_KEY = 'a'.repeat(64);

describe('encrypt / decrypt', () => {
  it('round-trips a simple string', () => {
    const plaintext = 'hello world';
    const ciphertext = encrypt(plaintext, TEST_KEY);
    expect(decrypt(ciphertext, TEST_KEY)).toBe(plaintext);
  });

  it('round-trips an empty string', () => {
    const ciphertext = encrypt('', TEST_KEY);
    expect(decrypt(ciphertext, TEST_KEY)).toBe('');
  });

  it('round-trips a long token-like string', () => {
    const token = randomBytes(256).toString('base64');
    const ciphertext = encrypt(token, TEST_KEY);
    expect(decrypt(ciphertext, TEST_KEY)).toBe(token);
  });

  it('round-trips unicode content', () => {
    const plaintext = 'שלום עולם — מפתח הצפנה 🔐';
    const ciphertext = encrypt(plaintext, TEST_KEY);
    expect(decrypt(ciphertext, TEST_KEY)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const plaintext = 'deterministic test';
    const c1 = encrypt(plaintext, TEST_KEY);
    const c2 = encrypt(plaintext, TEST_KEY);
    expect(c1).not.toBe(c2);
    // But both decrypt to the same value
    expect(decrypt(c1, TEST_KEY)).toBe(plaintext);
    expect(decrypt(c2, TEST_KEY)).toBe(plaintext);
  });

  it('fails to decrypt with a wrong key', () => {
    const ciphertext = encrypt('secret', TEST_KEY);
    const wrongKey = 'b'.repeat(64);
    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });

  it('fails to decrypt tampered ciphertext', () => {
    const ciphertext = encrypt('secret', TEST_KEY);
    // Flip a character in the middle of the base64 string
    const mid = Math.floor(ciphertext.length / 2);
    const tampered =
      ciphertext.substring(0, mid) +
      (ciphertext[mid] === 'A' ? 'B' : 'A') +
      ciphertext.substring(mid + 1);
    expect(() => decrypt(tampered, TEST_KEY)).toThrow();
  });
});
