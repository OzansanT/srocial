import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'srocial_session';
const EXPIRED_DATE = 'Thu, 01 Jan 1970 00:00:00 GMT';

function sign(value, secret) {
  return createHmac('sha256', secret).update(value, 'utf8').digest();
}

function encodeSignature(value) {
  return value.toString('base64url');
}

function readCookie(cookieHeader, name) {
  if (typeof cookieHeader !== 'string' || cookieHeader.length === 0) return null;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    if (trimmed.slice(0, separator) === name) return trimmed.slice(separator + 1);
  }
  return null;
}

function cookieAttributes({ secure, maxAge, expires = null }) {
  const attributes = [
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`
  ];
  if (expires) attributes.push(`Expires=${expires}`);
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}

export function createSessionCookieManager({ secret, ttlSeconds = 28_800, secure = false, now = () => new Date() } = {}) {
  if (typeof secret !== 'string' || secret.length === 0) throw new TypeError('session secret is required');
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) throw new TypeError('ttlSeconds must be a positive integer');
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  return Object.freeze({
    issue(username) {
      if (typeof username !== 'string' || username.length === 0) throw new TypeError('username is required');
      const issuedAt = Math.floor(now().getTime() / 1000);
      const payload = Buffer.from(JSON.stringify({ sub: username, iat: issuedAt, exp: issuedAt + ttlSeconds }), 'utf8').toString('base64url');
      const signature = encodeSignature(sign(payload, secret));
      return `${COOKIE_NAME}=${payload}.${signature}; ${cookieAttributes({ secure, maxAge: ttlSeconds })}`;
    },

    read(cookieHeader) {
      const value = readCookie(cookieHeader, COOKIE_NAME);
      if (!value) return null;
      const parts = value.split('.');
      if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

      try {
        const expectedSignature = sign(parts[0], secret);
        const suppliedSignature = Buffer.from(parts[1], 'base64url');
        if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) return null;

        const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        const currentTime = Math.floor(now().getTime() / 1000);
        if (!payload || typeof payload !== 'object') return null;
        if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
        if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)) return null;
        if (payload.exp <= payload.iat || payload.iat > currentTime || payload.exp <= currentTime) return null;
        return { username: payload.sub };
      } catch {
        return null;
      }
    },

    clear() {
      return `${COOKIE_NAME}=; ${cookieAttributes({ secure, maxAge: 0, expires: EXPIRED_DATE })}`;
    }
  });
}
