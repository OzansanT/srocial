function scopesFrom(value) { return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean); }

export const threadsOAuthProvider = {
  name: 'threads',
  isConfigured(env) { return Boolean(env?.THREADS_APP_ID && env?.THREADS_AUTH_URL); },
  getAuthorizationUrl({ state, redirectUri, env }) {
    const url = new URL(env.THREADS_AUTH_URL);
    url.searchParams.set('client_id', env.THREADS_APP_ID);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    const scopes = scopesFrom(env.THREADS_OAUTH_SCOPES);
    if (scopes.length) url.searchParams.set('scope', scopes.join(','));
    return url.toString();
  },
  normalizeCallback(query) {
    return { code: query.get('code') ?? null, state: query.get('state') ?? null, error: query.get('error') ?? null, scopes: scopesFrom(query.get('scope')) };
  }
};
