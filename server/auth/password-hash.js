import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const FORMAT = 'scrypt';
const VERSION = 'v1';
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 200;

function validatePassword(password) {
  if (typeof password !== 'string') throw new Error('PASSWORD_INVALID');
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new Error('PASSWORD_LENGTH_INVALID');
  }
}

export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(SALT_BYTES);
  const digest = Buffer.from(await scrypt(password, salt, KEY_BYTES));
  return `${FORMAT}$${VERSION}$${salt.toString('base64url')}$${digest.toString('base64url')}`;
}

export async function verifyPassword(password, encodedHash) {
  if (typeof password !== 'string' || typeof encodedHash !== 'string') return false;
  const parts = encodedHash.split('$');
  if (parts.length !== 4 || parts[0] !== FORMAT || parts[1] !== VERSION) return false;

  try {
    const salt = Buffer.from(parts[2], 'base64url');
    const expected = Buffer.from(parts[3], 'base64url');
    if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;
    const actual = Buffer.from(await scrypt(password, salt, expected.length));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
