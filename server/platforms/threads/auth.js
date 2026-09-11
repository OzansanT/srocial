function oauthError() {
  const error = new Error('AUTH_ERROR');
  error.code = 'AUTH_ERROR';
  error.retryable = false;
  return error;
}

function cleanCode(value) {
  return String(value ?? '').split('#', 1)[0].trim();
}

function expiration(now, seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return null;
  return new Date(now().getTime() + (value * 1000)).toISOString();
}

export function createThreadsOAuthProvider({ config, client, now = () => new Date() } = {}) {
  if (!config || !client) throw new Error('THREADS_OAUTH_DEPENDENCIES_REQUIRED');

  async function getAuthorizationUrl({ state, redirectUri }) {
    if (!state || !redirectUri) throw oauthError();
    const url = new URL('https://threads.net/oauth/authorize');
    url.searchParams.set('client_id', config.appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', config.scopes.join(','));
    url.searchParams.set('state', state);
    return url.toString();
  }

  async function exchangeCode({ code, redirectUri }) {
    const authorizationCode = cleanCode(code);
    if (!authorizationCode || !redirectUri) throw oauthError();
    const shortToken = await client.formPost('https://graph.threads.net/oauth/access_token', {
      client_id: config.appId,
      client_secret: config.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code: authorizationCode
    });
    if (!shortToken?.access_token) throw oauthError();
    const longToken = await client.getGraph('/access_token', {
      versioned: false,
      query: {
        grant_type: 'th_exchange_token',
        client_secret: config.appSecret,
        access_token: shortToken.access_token
      }
    });
    if (!longToken?.access_token) throw oauthError();
    return {
      accessToken: String(longToken.access_token),
      refreshToken: null,
      expiresAt: expiration(now, longToken.expires_in),
      scopes: [...config.scopes]
    };
  }

  async function refreshAccessToken({ accessToken }) {
    if (!accessToken) throw oauthError();
    const refreshed = await client.getGraph('/refresh_access_token', {
      versioned: false,
      query: { grant_type: 'th_refresh_token', access_token: accessToken }
    });
    if (!refreshed?.access_token) throw oauthError();
    const expiresAt = expiration(now, refreshed.expires_in);
    if (!expiresAt) throw oauthError();
    return { accessToken: String(refreshed.access_token), expiresAt };
  }

  async function getAccountIdentity({ accessToken }) {
    if (!accessToken) throw oauthError();
    const identity = await client.getGraph('/me', {
      accessToken,
      query: { fields: 'id,username,threads_profile_picture_url' }
    });
    const id = String(identity?.id ?? '').trim();
    const username = String(identity?.username ?? '').trim();
    if (!id || !username) throw oauthError();
    return {
      providerAccountId: id,
      displayName: username,
      username,
      accountType: 'THREADS',
      profilePictureUrl: String(identity?.threads_profile_picture_url ?? '').trim() || null
    };
  }

  return { getAuthorizationUrl, exchangeCode, refreshAccessToken, getAccountIdentity };
}
