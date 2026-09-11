export const THREADS_SCOPES = Object.freeze([
  'threads_basic',
  'threads_content_publish'
]);

function normalizeVersion(value, fallback = 'v1.0') {
  const version = String(value ?? '').trim();
  if (!version) return fallback;
  return version.startsWith('v') ? version : `v${version}`;
}

export function getThreadsConfig(env = process.env) {
  const appId = String(env.THREADS_APP_ID ?? '').trim();
  const appSecret = String(env.THREADS_APP_SECRET ?? '').trim();
  if (!appId || !appSecret) return null;
  return {
    appId,
    appSecret,
    apiVersion: normalizeVersion(env.THREADS_API_VERSION),
    scopes: [...THREADS_SCOPES]
  };
}
