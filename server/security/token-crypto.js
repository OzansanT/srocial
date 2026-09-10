import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

function deriveKey(secret) {
  const value = String(secret ?? '');
  if (!value) throw new Error('Token encryption secret is required');
  return createHash('sha256').update(value).digest();
}

export function createTokenCipher(secret) {
  const key = deriveKey(secret);

  return {
    encrypt(value) {
      if (value === null || value === undefined) return null;
      const iv = randomBytes(12);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
    },

    decrypt(payload) {
      if (payload === null || payload === undefined) return null;
      const [version, ivText, tagText, ciphertextText, extra] = String(payload).split('.');
      if (version !== VERSION || !ivText || !tagText || ciphertextText === undefined || extra !== undefined) {
        throw new Error('Invalid encrypted token payload');
      }
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivText, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextText, 'base64url')),
        decipher.final()
      ]).toString('utf8');
    }
  };
}
