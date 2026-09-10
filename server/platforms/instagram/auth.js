function providerContractError(code) {
  const error = new Error(code);
  error.code = code;
  error.retryable = false;
  return error;
}

function cleanAuthorizationCode(code) {
  return String(code ?? '').split('#')[0].trim();
}

export function createInstagramOAuthProvider({ config, client, now = () => new Date() } = {}) {
  if (!config?.appId || !config?.appSecret) throw new Error('INSTAGRAM_CONFIG_REQUIRED');
  if (!client) throw new Error('INSTAGRAM_CLIENT_REQUIRED');

  return {
    async getAuthorizationUrl({ state, redirectUri }) {
      const url = new URL('https://www.instagram.com/oauth/authorize');
      url.searchParams.set('client_id', config.appId);
      url.searchParams.set('redirect_uri', String(redirectUri));
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', config.scopes.join(','));
      url.searchParams.set('state', String(state));
      return url.toString();
    },

    async exchangeCode({ code, redirectUri }) {
      const cleanedCode = cleanAuthorizationCode(code);
      if (!cleanedCode) throw providerContractError('AUTH_ERROR');
      const short = await client.formPost('https://api.instagram.com/oauth/access_token', {
        client_id: config.appId,
        client_secret: config.appSecret,
        grant_type: 'authorization_code',
        redirect_uri: String(redirectUri),
        code: cleanedCode
      });
      if (!short?.access_token) throw providerContractError('AUTH_ERROR');
      const long = await client.getGraph('/access_token', {
        versioned: false,
        query: {
          grant_type: 'ig_exchange_token',
          client_secret: config.appSecret,
          access_token: short.access_token
        }
      });
      if (!long?.access_token) throw providerContractError('AUTH_ERROR');
      const expiresIn = Number(long.expires_in);
      const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(now().getTime() + expiresIn * 1000).toISOString() : null;
      return { accessToken: long.access_token, refreshToken: null, expiresAt, scopes: [...config.scopes] };
    },

    async getAccountIdentity({ accessToken }) {
      const identity = await client.getGraph('/me', {
        accessToken,
        query: { fields: 'id,username,account_type,profile_picture_url' }
      });
      if (!identity?.id) throw providerContractError('AUTH_ERROR');
      const username = identity.username ?? null;
      return {
        providerAccountId: String(identity.id),
        displayName: username,
        username,
        accountType: identity.account_type ?? null,
        profilePictureUrl: identity.profile_picture_url ?? null
      };
    }
  };
}
