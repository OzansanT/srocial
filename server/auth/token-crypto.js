import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function deriveKey(secret) {
  const value = String(secret ?? '').trim();
  if (!value) throw new Error('TOKEN_ENCRYPTION_KEY_REQUIRED');
  return createHash('sha256').update(value).digest();
}

export function createTokenCipher(secret) {
  const key = deriveKey(secret);
  return {
    encrypt(value) {
      if (value === null || value === undefined || value === '') return value;
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
    },
    decrypt(payload) {
      if (payload === null || payload === undefined || payload === '') return payload;
      const [version, ivPart, tagPart, encryptedPart] = String(payload).split('.');
      if (version !== 'v1' || !ivPart || !tagPart || encryptedPart === undefined) throw new Error('INVALID_ENCRYPTED_TOKEN');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(encryptedPart, 'base64url')), decipher.final()]).toString('utf8');
    }
  };
}
