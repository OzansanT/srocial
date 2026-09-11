const DEFAULT_PUBLIC_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_SESSION_TTL_SECONDS = 28_800;
const DEFAULT_API_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_API_RATE_LIMIT_MAX = 120;
const DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS = 900_000;
const DEFAULT_LOGIN_RATE_LIMIT_MAX = 10;

function createConfigError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function readPositiveInteger(value, fallback, name) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw createConfigError('APP_AUTH_LIMIT_INVALID', `${name} must be a positive integer`);
  }
  return parsed;
}

function readPublicUrl(value) {
  const raw = String(value ?? DEFAULT_PUBLIC_BASE_URL).trim();
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported protocol');
    return url;
  } catch {
    throw createConfigError('APP_AUTH_PUBLIC_BASE_URL_INVALID', 'PUBLIC_BASE_URL must be a valid HTTP(S) URL');
  }
}

export function readAppAuthConfig(env = {}) {
  const enabled = String(env.APP_AUTH_ENABLED ?? 'false').trim().toLowerCase() === 'true';
  const username = String(env.ADMIN_USERNAME ?? 'admin').trim() || 'admin';
  const password = String(env.ADMIN_PASSWORD ?? '');
  const sessionSecret = String(env.SESSION_SECRET ?? '');
  const publicUrl = readPublicUrl(env.PUBLIC_BASE_URL);

  if (enabled && password.length < 12) {
    throw createConfigError('APP_AUTH_PASSWORD_WEAK', 'ADMIN_PASSWORD must contain at least 12 characters when application auth is enabled');
  }
  if (enabled && sessionSecret.length < 32) {
    throw createConfigError('APP_AUTH_SESSION_SECRET_WEAK', 'SESSION_SECRET must contain at least 32 characters when application auth is enabled');
  }

  return Object.freeze({
    enabled,
    username,
    password,
    sessionSecret,
    sessionTtlSeconds: readPositiveInteger(env.SESSION_TTL_SECONDS, DEFAULT_SESSION_TTL_SECONDS, 'SESSION_TTL_SECONDS'),
    secureCookies: publicUrl.protocol === 'https:',
    publicOrigin: publicUrl.origin,
    apiRateLimit: Object.freeze({
      windowMs: readPositiveInteger(env.API_RATE_LIMIT_WINDOW_MS, DEFAULT_API_RATE_LIMIT_WINDOW_MS, 'API_RATE_LIMIT_WINDOW_MS'),
      max: readPositiveInteger(env.API_RATE_LIMIT_MAX, DEFAULT_API_RATE_LIMIT_MAX, 'API_RATE_LIMIT_MAX')
    }),
    loginRateLimit: Object.freeze({
      windowMs: readPositiveInteger(env.LOGIN_RATE_LIMIT_WINDOW_MS, DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS, 'LOGIN_RATE_LIMIT_WINDOW_MS'),
      max: readPositiveInteger(env.LOGIN_RATE_LIMIT_MAX, DEFAULT_LOGIN_RATE_LIMIT_MAX, 'LOGIN_RATE_LIMIT_MAX')
    })
  });
}
