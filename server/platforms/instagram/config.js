export const INSTAGRAM_SCOPES = Object.freeze([
  'instagram_business_basic',
  'instagram_business_content_publish'
]);

function normalizeVersion(value) {
  const raw = String(value ?? 'v26.0').trim() || 'v26.0';
  return raw.startsWith('v') ? raw : `v${raw}`;
}

export function getInstagramConfig(env = process.env) {
  const appId = String(env.INSTAGRAM_APP_ID ?? '').trim();
  const appSecret = String(env.INSTAGRAM_APP_SECRET ?? '').trim();
  if (!appId || !appSecret) return null;
  return {
    appId,
    appSecret,
    apiVersion: normalizeVersion(env.INSTAGRAM_API_VERSION),
    scopes: [...INSTAGRAM_SCOPES]
  };
}
