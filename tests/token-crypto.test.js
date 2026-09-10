import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenCipher } from '../server/auth/token-crypto.js';

test('encrypts and decrypts token values', () => {
  const cipher = createTokenCipher('a sufficiently long test secret');
  const encrypted = cipher.encrypt('access-token');
  assert.notEqual(encrypted, 'access-token');
  assert.equal(cipher.decrypt(encrypted), 'access-token');
});

test('uses randomized ciphertext for repeated plaintext', () => {
  const cipher = createTokenCipher('a sufficiently long test secret');
  assert.notEqual(cipher.encrypt('same'), cipher.encrypt('same'));
});

test('preserves nullish or empty token values', () => {
  const cipher = createTokenCipher('a sufficiently long test secret');
  assert.equal(cipher.encrypt(null), null);
  assert.equal(cipher.encrypt(''), '');
  assert.equal(cipher.decrypt(null), null);
  assert.equal(cipher.decrypt(''), '');
});

test('rejects missing encryption key', () => {
  assert.throws(() => createTokenCipher(''), /TOKEN_ENCRYPTION_KEY_REQUIRED/);
});
