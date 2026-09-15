import { hashPassword, verifyPassword } from './password-hash.js';
import { ROLES, normalizeRole } from './roles.js';

const USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/;
const MAX_DISPLAY_NAME_LENGTH = 100;

export function normalizeUsername(value) {
  const username = String(value ?? '').trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) throw new Error('USERNAME_INVALID');
  return username;
}

export function normalizeDisplayName(value, fallback = '') {
  const displayName = String(value ?? '').trim() || String(fallback ?? '').trim();
  if (!displayName || displayName.length > MAX_DISPLAY_NAME_LENGTH) throw new Error('DISPLAY_NAME_INVALID');
  return displayName;
}

export function safeSessionUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role
  };
}

export function createUserService({ repository, now = () => new Date() } = {}) {
  if (!repository) throw new Error('USER_REPOSITORY_REQUIRED');
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  return Object.freeze({
    async ensureBootstrapAdmin({ username, password } = {}) {
      const existing = await repository.listUsers();
      if (existing.length > 0) return null;

      const usernameNormalized = normalizeUsername(username);
      const timestamp = now().toISOString();
      return repository.createUser({
        username: usernameNormalized,
        usernameNormalized,
        displayName: normalizeDisplayName(username, usernameNormalized),
        role: ROLES.ADMIN,
        status: 'ACTIVE',
        passwordHash: await hashPassword(password),
        createdAt: timestamp,
        updatedAt: timestamp
      });
    },

    async authenticate(username, password) {
      let usernameNormalized;
      try {
        usernameNormalized = normalizeUsername(username);
      } catch {
        return null;
      }
      if (typeof password !== 'string') return null;

      const user = await repository.findUserByUsernameNormalized(usernameNormalized);
      if (!user || user.status !== 'ACTIVE') return null;
      if (!(await verifyPassword(password, user.passwordHash))) return null;
      return safeSessionUser({ ...user, role: normalizeRole(user.role) });
    }
  });
}
