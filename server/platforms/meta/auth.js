function scopesFrom(value) {
  return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

function normalizeCallback(query) {
  return {
    code: query.get('code') ?? null,
    state: query.get('state') ?? null,
    error: query.get('error') ?? null,
    scopes: scopesFrom(query.get('granted_scopes') ?? query.get('scope'))
  };
}

export function createMetaOAuthProvider({ name, scopesEnvKey }) {
  return {
    name,
    isConfigured(env) {
      return Boolean(env?.META_APP_ID && env?.META_AUTH_URL);
    },
    getAuthorizationUrl({ state, redirectUri, env }) {
      const url = new URL(env.META_AUTH_URL);
      url.searchParams.set('client_id', env.META_APP_ID);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('state', state);
      url.searchParams.set('response_type', 'code');
      const scopes = scopesFrom(env?.[scopesEnvKey]);
      if (scopes.length) url.searchParams.set('scope', scopes.join(','));
      return url.toString();
    },
    normalizeCallback
  };
}
