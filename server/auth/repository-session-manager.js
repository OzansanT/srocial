import { createHmac, randomBytes } from 'node:crypto';
import { safeSessionUser } from './user-service.js';

const COOKIE_NAME = 'srocial_session';
const TOKEN_BYTES = 32;

function tokenHash(secret, token) {
  return createHmac('sha256', secret).update(token).digest('base64url');
}

function cookieValue(cookieHeader) {
  const source = String(cookieHeader ?? '');
  for (const part of source.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === COOKIE_NAME) return part.slice(index + 1).trim();
  }
  return null;
}

function cookieAttributes({ maxAge, secure }) {
  return [
    `Path=/`,
    `HttpOnly`,
    `SameSite=Strict`,
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : null
  ].filter(Boolean).join('; ');
}

export function createRepositorySessionManager({ repository, secret, ttlSeconds, secure = false, now = () => new Date() } = {}) {
  if (!repository) throw new Error('SESSION_REPOSITORY_REQUIRED');
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('SESSION_SECRET_INVALID');
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) throw new Error('SESSION_TTL_INVALID');
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  return Object.freeze({
    async issue(userId) {
      const token = randomBytes(TOKEN_BYTES).toString('base64url');
      const createdAt = now();
      const expiresAt = new Date(createdAt.getTime() + ttlSeconds * 1000);
      const record = await repository.createUserSession({
        userId,
        tokenHash: tokenHash(secret, token),
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        revokedAt: null
      });
      return {
        sessionId: record.id,
        cookie: `${COOKIE_NAME}=${token}; ${cookieAttributes({ maxAge: ttlSeconds, secure })}`
      };
    },

    async read(cookieHeader) {
      const token = cookieValue(cookieHeader);
      if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
      const session = await repository.findUserSessionByTokenHash(tokenHash(secret, token));
      if (!session || session.revokedAt) return null;
      const expiresAt = Date.parse(session.expiresAt ?? '');
      if (!Number.isFinite(expiresAt) || expiresAt <= now().getTime()) return null;
      const user = await repository.getUser(session.userId);
      if (!user || user.status !== 'ACTIVE') return null;
      return { sessionId: session.id, user: safeSessionUser(user) };
    },

    async revoke(sessionId) {
      if (!sessionId) return null;
      return repository.revokeUserSession(sessionId, { revokedAt: now().toISOString() });
    },

    clearCookie() {
      return `${COOKIE_NAME}=; ${cookieAttributes({ maxAge: 0, secure })}`;
    }
  });
}
