import { readAppAuthConfig } from './app-auth-config.js';
import { createAdminAuthenticator } from './admin-authenticator.js';
import { createSessionCookieManager } from './session-cookie.js';
import { createFixedWindowLimiter } from '../http/fixed-window-limiter.js';
import { isSameOriginMutation } from '../http/request-origin.js';

function clientKey(request) {
  return String(request?.socket?.remoteAddress ?? 'unknown');
}

export function createAppAuth({ env = process.env, now = () => new Date() } = {}) {
  if (typeof now !== 'function') throw new TypeError('now must be a function');
  const config = readAppAuthConfig(env);

  if (!config.enabled) {
    return Object.freeze({
      enabled: false,
      username: config.username,
      publicOrigin: config.publicOrigin,
      login() {
        return { statusCode: 503, payload: { error: 'auth_not_configured' } };
      },
      readSession() { return null; },
      issueLogoutCookie() { return null; },
      consumeApi() { return { allowed: true, retryAfterSeconds: 0, remaining: config.apiRateLimit.max }; },
      validateMutation() { return true; }
    });
  }

  const authenticator = createAdminAuthenticator({ username: config.username, password: config.password });
  const sessions = createSessionCookieManager({
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

    login(request, credentials = {}) {
      const limit = loginLimiter.consume(clientKey(request));
      if (!limit.allowed) {
        return {
          statusCode: 429,
          payload: { error: 'rate_limited' },
          retryAfterSeconds: limit.retryAfterSeconds
        };
      }
      if (!authenticator.authenticate(credentials?.username, credentials?.password)) {
        return { statusCode: 401, payload: { error: 'invalid_credentials' } };
      }
      return {
        statusCode: 200,
        payload: { authenticated: true },
        setCookie: sessions.issue(config.username)
      };
    },

    readSession(request) {
      return sessions.read(request?.headers?.cookie ?? '');
    },

    issueLogoutCookie() {
      return sessions.clear();
    },

    consumeApi(request) {
      return apiLimiter.consume(clientKey(request));
    },

    validateMutation(request) {
      return isSameOriginMutation(request, config.publicOrigin);
    }
  });
}
