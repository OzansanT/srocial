import { hashPassword } from '../auth/password-hash.js';
import { normalizeDisplayName, normalizeUsername } from '../auth/user-service.js';
import { ROLES, normalizeRole } from '../auth/roles.js';

const USER_STATUSES = new Set(['ACTIVE', 'DISABLED']);

function normalizeStatus(value) {
  const status = String(value ?? '').trim().toUpperCase();
  if (!USER_STATUSES.has(status)) throw new Error('STATUS_INVALID');
  return status;
}

function safeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function isUsernameConflict(error) {
  return error?.message === 'USERNAME_CONFLICT'
    || error?.code === '23505'
    || error?.constraint === 'app_users_username_normalized_key';
}

function isActiveAdmin(user) {
  return user?.role === ROLES.ADMIN && user?.status === 'ACTIVE';
}

export function createUserManagementService({ repository, now = () => new Date() } = {}) {
  if (!repository) throw new Error('USER_REPOSITORY_REQUIRED');
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  async function requireUser(id) {
    const user = await repository.getUser(id);
    if (!user) throw new Error('USER_NOT_FOUND');
    return user;
  }

  async function assertAdminContinuity(target, nextRole, nextStatus, actorUserId) {
    const demotesActiveAdmin = isActiveAdmin(target)
      && (nextRole !== ROLES.ADMIN || nextStatus !== 'ACTIVE');
    if (!demotesActiveAdmin) return;

    if (target.id === actorUserId) throw new Error('SELF_LOCKOUT_FORBIDDEN');

    const users = await repository.listUsers();
    if (users.filter(isActiveAdmin).length <= 1) throw new Error('LAST_ADMIN_FORBIDDEN');
  }

  return Object.freeze({
    async listUsers() {
      return (await repository.listUsers()).map(safeUser);
    },

    async createUser(input = {}) {
      const usernameNormalized = normalizeUsername(input.username);
      if (await repository.findUserByUsernameNormalized(usernameNormalized)) {
        throw new Error('USERNAME_CONFLICT');
      }

      const timestamp = now().toISOString();
      const record = {
        username: usernameNormalized,
        usernameNormalized,
        displayName: normalizeDisplayName(input.displayName, usernameNormalized),
        role: normalizeRole(input.role),
        status: 'ACTIVE',
        passwordHash: await hashPassword(input.password),
        createdAt: timestamp,
        updatedAt: timestamp
      };

      try {
        return safeUser(await repository.createUser(record));
      } catch (error) {
        if (isUsernameConflict(error)) throw new Error('USERNAME_CONFLICT');
        throw error;
      }
    },

    async updateUser(targetUserId, input = {}, { actorUserId } = {}) {
      const target = await requireUser(targetUserId);
      const patch = {};

      if (Object.prototype.hasOwnProperty.call(input, 'displayName')) {
        patch.displayName = normalizeDisplayName(input.displayName, target.username);
      }
      if (Object.prototype.hasOwnProperty.call(input, 'role')) {
        patch.role = normalizeRole(input.role);
      }
      if (Object.prototype.hasOwnProperty.call(input, 'status')) {
        patch.status = normalizeStatus(input.status);
      }
      if (Object.keys(patch).length === 0) throw new Error('USER_UPDATE_EMPTY');

      const nextRole = patch.role ?? target.role;
      const nextStatus = patch.status ?? target.status;
      await assertAdminContinuity(target, nextRole, nextStatus, actorUserId);

      patch.updatedAt = now().toISOString();
      const updated = await repository.updateUser(target.id, patch);
      if (!updated) throw new Error('USER_NOT_FOUND');

      if (target.status === 'ACTIVE' && updated.status === 'DISABLED') {
        await repository.revokeUserSessionsForUser(target.id, { revokedAt: now().toISOString() });
      }
      return safeUser(updated);
    },

    async changePassword(targetUserId, password) {
      const target = await requireUser(targetUserId);
      const updatedAt = now().toISOString();
      const passwordHash = await hashPassword(password);
      const updated = await repository.updateUser(target.id, { passwordHash, updatedAt });
      if (!updated) throw new Error('USER_NOT_FOUND');
      await repository.revokeUserSessionsForUser(target.id, { revokedAt: updatedAt });
      return safeUser(updated);
    },

    async revokeSessions(targetUserId) {
      await requireUser(targetUserId);
      const revokedAt = now().toISOString();
      const revoked = await repository.revokeUserSessionsForUser(targetUserId, { revokedAt });
      return { revoked };
    }
  });
}
