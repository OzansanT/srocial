function oauthError(code = 'AUTH_ERROR') {
  const error = new Error(code);
  error.code = code;
  error.retryable = false;
  return error;
}

function cleanCode(value) {
  return String(value ?? '').split('#', 1)[0].trim();
}

function authorizationUrl(config, { state, redirectUri }) {
  const url = new URL(`https://www.facebook.com/${config.apiVersion}/dialog/oauth`);
  url.searchParams.set('client_id', config.appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scopes.join(','));
  url.searchParams.set('state', state);
  return url.toString();
}

function validPage(page) {
  return page && String(page.id ?? '').trim() && String(page.access_token ?? '').trim();
}

export function createFacebookOAuthProvider({ config, client } = {}) {
  if (!config || !client) throw new Error('FACEBOOK_OAUTH_DEPENDENCIES_REQUIRED');

  async function getAuthorizationUrl({ state, redirectUri }) {
    if (!state || !redirectUri) throw oauthError();
    return authorizationUrl(config, { state, redirectUri });
  }

  async function resolvePageToken(userAccessToken) {
    if (config.pageId) {
      const page = await client.getGraph(`/${config.pageId}`, {
        accessToken: userAccessToken,
        query: { fields: 'id,name,access_token,tasks' }
      });
      if (!validPage(page) || String(page.id) !== String(config.pageId)) throw oauthError();
      return page;
    }

    const response = await client.getGraph('/me/accounts', {
      accessToken: userAccessToken,
      query: { fields: 'id,name,access_token,tasks' }
    });
    const pages = Array.isArray(response?.data) ? response.data.filter(validPage) : [];
    if (pages.length === 0) throw oauthError();
    if (pages.length > 1) throw oauthError('PAGE_SELECTION_REQUIRED');
    return pages[0];
  }

  async function exchangeCode({ code, redirectUri }) {
    const authorizationCode = cleanCode(code);
    if (!authorizationCode || !redirectUri) throw oauthError();

    const shortToken = await client.getGraph('/oauth/access_token', {
      query: {
        client_id: config.appId,
        client_secret: config.appSecret,
        redirect_uri: redirectUri,
        code: authorizationCode
      }
    });
    if (!shortToken?.access_token) throw oauthError();

    const longToken = await client.getGraph('/oauth/access_token', {
      query: {
        grant_type: 'fb_exchange_token',
        client_id: config.appId,
        client_secret: config.appSecret,
        fb_exchange_token: shortToken.access_token
      }
    });
    if (!longToken?.access_token) throw oauthError();

    const page = await resolvePageToken(longToken.access_token);
    return {
      accessToken: String(page.access_token),
      refreshToken: null,
      expiresAt: null,
      scopes: [...config.scopes]
    };
  }

  async function getAccountIdentity({ accessToken }) {
    if (!accessToken) throw oauthError();
    const page = await client.getGraph('/me', {
      accessToken,
      query: { fields: 'id,name,picture' }
    });
    const id = String(page?.id ?? '').trim();
    const name = String(page?.name ?? '').trim();
    if (!id || !name) throw oauthError();
    return {
      providerAccountId: id,
      displayName: name,
      username: null,
      accountType: 'PAGE',
      profilePictureUrl: String(page?.picture?.data?.url ?? '').trim() || null
    };
  }

  return { getAuthorizationUrl, exchangeCode, getAccountIdentity };
}
