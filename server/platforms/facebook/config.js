export const FACEBOOK_SCOPES = Object.freeze([
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts'
]);

function normalizeVersion(value, fallback = 'v26.0') {
  const version = String(value ?? '').trim();
  if (!version) return fallback;
  return version.startsWith('v') ? version : `v${version}`;
}

export function getFacebookConfig(env = process.env) {
  const appId = String(env.FACEBOOK_APP_ID ?? '').trim();
  const appSecret = String(env.FACEBOOK_APP_SECRET ?? '').trim();
  if (!appId || !appSecret) return null;

  return {
    appId,
    appSecret,
    apiVersion: normalizeVersion(env.FACEBOOK_API_VERSION),
    pageId: String(env.FACEBOOK_PAGE_ID ?? '').trim() || null,
    scopes: [...FACEBOOK_SCOPES]
  };
}
