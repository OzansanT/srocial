const DEFAULT_SCOPES = Object.freeze(['user.info.basic', 'video.publish']);

export function getTikTokConfig(env = process.env) {
  const clientKey = String(env?.TIKTOK_CLIENT_KEY ?? '').trim();
  const clientSecret = String(env?.TIKTOK_CLIENT_SECRET ?? '').trim();
  if (!clientKey || !clientSecret) return null;
  const configuredScopes = String(env?.TIKTOK_SCOPES ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  return {
    clientKey,
    clientSecret,
    scopes: configuredScopes.length ? [...new Set(configuredScopes)] : [...DEFAULT_SCOPES]
  };
}
