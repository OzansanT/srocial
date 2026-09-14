function authError() {
  const error = new Error('AUTH_ERROR');
  error.code = 'AUTH_ERROR';
  error.retryable = false;
  return error;
}

function expiresAt(now, seconds) {
  const duration = Number(seconds);
  if (!Number.isFinite(duration) || duration <= 0) throw authError();
  return new Date(now().getTime() + duration * 1000).toISOString();
}

function scopesFrom(value, fallback) {
  const values = String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  return values.length ? [...new Set(values)] : [...fallback];
}

export function createTikTokOAuthProvider({ config, client, now = () => new Date() } = {}) {
  if (!config?.clientKey || !config?.clientSecret || !Array.isArray(config?.scopes)) throw new Error('TIKTOK_CONFIG_REQUIRED');
  if (!client) throw new Error('TIKTOK_CLIENT_REQUIRED');

  return {
    async getAuthorizationUrl({ state, redirectUri } = {}) {
      const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
      url.searchParams.set('client_key', config.clientKey);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', config.scopes.join(','));
      url.searchParams.set('redirect_uri', String(redirectUri ?? ''));
      url.searchParams.set('state', String(state ?? ''));
      return url.toString();
    },

    async exchangeCode({ code, redirectUri } = {}) {
      const normalizedCode = String(code ?? '').trim();
      if (!normalizedCode) throw authError();
      const payload = await client.formPost('/v2/oauth/token/', {
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        code: normalizedCode,
        grant_type: 'authorization_code',
        redirect_uri: String(redirectUri ?? '')
      });
      const accessToken = String(payload?.access_token ?? '').trim();
      const refreshToken = String(payload?.refresh_token ?? '').trim();
      if (!accessToken || !refreshToken) throw authError();
      return {
        accessToken,
        refreshToken,
        expiresAt: expiresAt(now, payload?.expires_in),
        scopes: scopesFrom(payload?.scope, config.scopes)
      };
    },

    async refreshAccessToken({ refreshToken } = {}) {
      const normalizedRefreshToken = String(refreshToken ?? '').trim();
      if (!normalizedRefreshToken) throw authError();
      const payload = await client.formPost('/v2/oauth/token/', {
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: normalizedRefreshToken
      });
      const accessToken = String(payload?.access_token ?? '').trim();
      const replacementRefreshToken = String(payload?.refresh_token ?? '').trim();
      if (!accessToken || !replacementRefreshToken) throw authError();
      return {
        accessToken,
        refreshToken: replacementRefreshToken,
        expiresAt: expiresAt(now, payload?.expires_in)
      };
    },

    async getAccountIdentity({ accessToken } = {}) {
      const token = String(accessToken ?? '').trim();
      if (!token) throw authError();
      const payload = await client.getApi('/v2/user/info/', {
        accessToken: token,
        query: { fields: 'open_id,avatar_url,display_name' }
      });
      const user = payload?.data?.user;
      const providerAccountId = String(user?.open_id ?? '').trim();
      if (!providerAccountId) throw authError();
      const displayName = String(user?.display_name ?? '').trim() || providerAccountId;
      return {
        providerAccountId,
        displayName,
        username: null,
        accountType: 'TIKTOK',
        profilePictureUrl: String(user?.avatar_url ?? '').trim() || null
      };
    }
  };
}
