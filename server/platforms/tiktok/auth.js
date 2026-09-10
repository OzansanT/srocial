const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
function scopesFrom(value) { return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean); }

export const tiktokOAuthProvider = {
  name: 'tiktok',
  isConfigured(env) { return Boolean(env?.TIKTOK_CLIENT_KEY); },
  getAuthorizationUrl({ state, redirectUri, env }) {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_key', env.TIKTOK_CLIENT_KEY);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopesFrom(env.TIKTOK_OAUTH_SCOPES || 'user.info.basic').join(','));
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return url.toString();
  },
  normalizeCallback(query) {
    return { code: query.get('code') ?? null, state: query.get('state') ?? null, error: query.get('error') ?? null, scopes: scopesFrom(query.get('scopes') ?? query.get('scope')) };
  }
};
