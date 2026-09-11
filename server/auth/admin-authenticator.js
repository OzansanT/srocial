import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest();
}

export function createAdminAuthenticator({ username, password } = {}) {
  if (typeof username !== 'string' || username.length === 0) throw new TypeError('username is required');
  if (typeof password !== 'string' || password.length === 0) throw new TypeError('password is required');

  const usernameDigest = digest(username);
  const passwordDigest = digest(password);

  return Object.freeze({
    authenticate(candidateUsername, candidatePassword) {
      const usernameMatches = timingSafeEqual(digest(candidateUsername), usernameDigest);
      const passwordMatches = timingSafeEqual(digest(candidatePassword), passwordDigest);
      return usernameMatches && passwordMatches;
    }
  });
}
