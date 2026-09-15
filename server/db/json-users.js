export function createJsonUsers({ mutate, update, stableRead, enqueueMutation, getData }) {
  return {
    createUser(record) { return mutate('users', record); },
    updateUser(id, patch) { return update('users', id, patch); },
    updateUserWithAdminContinuity(id, patch = {}) {
      return enqueueMutation(() => {
        const users = getData().users;
        const item = users.find((candidate) => candidate.id === id);
        if (!item) return null;

        const candidate = { ...item, ...structuredClone(patch), id: item.id };
        const removesActiveAdmin = item.role === 'ADMIN'
          && item.status === 'ACTIVE'
          && (candidate.role !== 'ADMIN' || candidate.status !== 'ACTIVE');

        if (removesActiveAdmin) {
          const activeAdmins = users.filter((user) => user.role === 'ADMIN' && user.status === 'ACTIVE').length;
          if (activeAdmins <= 1) throw new Error('LAST_ADMIN_FORBIDDEN');
        }

        Object.assign(item, candidate);
        return item;
      });
    },
    getUser(id) {
      return stableRead(() => getData().users.find((item) => item.id === id) ?? null);
    },
    findUserByUsernameNormalized(usernameNormalized) {
      return stableRead(() => getData().users.find((item) => item.usernameNormalized === usernameNormalized) ?? null);
    },
    listUsers() {
      return stableRead(() => [...getData().users].sort((a, b) => String(a.usernameNormalized).localeCompare(String(b.usernameNormalized))));
    },
    createUserSession(record) { return mutate('userSessions', record); },
    findUserSessionByTokenHash(tokenHash) {
      return stableRead(() => getData().userSessions.find((item) => item.tokenHash === tokenHash) ?? null);
    },
    revokeUserSession(id, { revokedAt }) {
      return update('userSessions', id, { revokedAt });
    },
    revokeUserSessionsForUser(userId, { revokedAt }) {
      return enqueueMutation(() => {
        const sessions = getData().userSessions.filter((item) => item.userId === userId);
        for (const session of sessions) session.revokedAt = revokedAt;
        return sessions.length;
      });
    }
  };
}
