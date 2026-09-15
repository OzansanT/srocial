import { readAppAuthConfig } from './app-auth-config.js';
import { createRepositorySessionManager } from './repository-session-manager.js';
import { createUserService } from './user-service.js';
import { createFixedWindowLimiter } from '../http/fixed-window-limiter.js';
import { isSameOriginMutation } from '../http/request-origin.js';

function clientKey(request) {
  return String(request?.socket?.remoteAddress ?? 'unknown');
}

export function createAppAuth({ env = process.env, repository = null, now = () => new Date() } = {}) {
  if (typeof now !== 'function') throw new TypeError('now must be a function');
  const config = readAppAuthConfig(env);

  if (!config.enabled) {
    return Object.freeze({
      enabled: false,
      username: config.username,
      publicOrigin: config.publicOrigin,
      async initialize() {},
      consumeLogin() { return { allowed: true, retryAfterSeconds: 0, remaining: config.loginRateLimit.max }; },
      async login() { return { statusCode: 503, payload: { error: 'auth_not_configured' } }; },
      async readSession() { return null; },
      async logout() { return { setCookie: null }; },
      issueLogoutCookie() { return null; },
      consumeApi() { return { allowed: true, retryAfterSeconds: 0, remaining: config.apiRateLimit.max }; },
      validateMutation() { return true; }
    });
  }

  if (!repository) throw new Error('APP_AUTH_REPOSITORY_REQUIRED');

  const users = createUserService({ repository, now });
  const sessions = createRepositorySessionManager({
    repository,
    secret: config.sessionSecret,
    ttlSeconds: config.sessionTtlSeconds,
    secure: config.secureCookies,
    now
  });
  const apiLimiter = createFixedWindowLimiter({
    ...config.apiRateLimit,
    now: () => now().getTime()
  });
  const loginLimiter = createFixedWindowLimiter({
    ...config.loginRateLimit,
    now: () => now().getTime()
  });

  return Object.freeze({
    enabled: true,
    username: config.username,
    publicOrigin: config.publicOrigin,

    async initialize() {
      await users.ensureBootstrapAdmin({ username: config.username, password: config.password });
    },

    consumeLogin(request) {
      return loginLimiter.consume(clientKey(request));
    },

    async login(credentials = {}) {
      const user = await users.authenticate(credentials?.username, credentials?.password);
      if (!user) return { statusCode: 401, payload: { error: 'invalid_credentials' } };
      const issued = await sessions.issue(user.id);
      return {
        statusCode: 200,
        payload: { authenticated: true },
        setCookie: issued.cookie
      };
    },

    readSession(request) {
      return sessions.read(request?.headers?.cookie ?? '');
    },

    async logout(session) {
      if (session?.sessionId) await sessions.revoke(session.sessionId);
      return { setCookie: sessions.clearCookie() };
    },

    issueLogoutCookie() {
      return sessions.clearCookie();
    },

    consumeApi(request) {
      return apiLimiter.consume(clientKey(request));
    },

    validateMutation(request) {
      return isSameOriginMutation(request, config.publicOrigin);
    }
  });
}
