function scopesFrom(value) { return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean); }

export const whatsappOAuthProvider = {
  name: 'whatsapp',
  isConfigured(env) { return Boolean(env?.WHATSAPP_APP_ID && env?.WHATSAPP_AUTH_URL); },
  getAuthorizationUrl({ state, redirectUri, env }) {
    const url = new URL(env.WHATSAPP_AUTH_URL);
    url.searchParams.set('client_id', env.WHATSAPP_APP_ID);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    const scopes = scopesFrom(env.WHATSAPP_OAUTH_SCOPES);
    if (scopes.length) url.searchParams.set('scope', scopes.join(','));
    return url.toString();
  },
  normalizeCallback(query) {
    return { code: query.get('code') ?? null, state: query.get('state') ?? null, error: query.get('error') ?? null, scopes: scopesFrom(query.get('scope')) };
  }
};
