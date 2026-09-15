export function createJsonUsers({ mutate, update, stableRead, enqueueMutation, getData }) {
  return {
    createUser(record) { return mutate('users', record); },
    updateUser(id, patch) { return update('users', id, patch); },
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
