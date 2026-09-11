const GRAPH_ORIGIN = 'https://graph.facebook.com';
const REEL_UPLOAD_HOST = 'rupload.facebook.com';
const AUTH_CODES = new Set([190]);
const PERMISSION_CODES = new Set([10, 200]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

export class FacebookProviderError extends Error {
  constructor(code, { retryable = false, status = null } = {}) {
    super(`Facebook provider request failed (${code}).`);
    this.name = 'FacebookProviderError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

function providerError(status, payload) {
  const providerCode = Number(payload?.error?.code);
  if (status === 401 || AUTH_CODES.has(providerCode)) return new FacebookProviderError('AUTH_ERROR', { status });
  if (status === 403 || PERMISSION_CODES.has(providerCode)) return new FacebookProviderError('PERMISSION_DENIED', { status });
  if (status === 429 || RATE_LIMIT_CODES.has(providerCode)) return new FacebookProviderError('RATE_LIMIT', { retryable: true, status });
  return new FacebookProviderError('PROVIDER_ERROR', { retryable: status >= 500, status });
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new FacebookProviderError('PROVIDER_ERROR', { retryable: response.status >= 500, status: response.status }); }
}

function graphUrl(path, { apiVersion, versioned = true, query = {} } = {}) {
  const normalizedPath = `/${String(path ?? '').replace(/^\/+/, '')}`;
  const prefix = versioned ? `/${apiVersion}` : '';
  const url = new URL(`${GRAPH_ORIGIN}${prefix}${normalizedPath}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url;
}

function formBody(fields = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  return params.toString();
}

export function createFacebookClient({ fetchImpl = globalThis.fetch, apiVersion = 'v26.0' } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('FACEBOOK_FETCH_REQUIRED');

  async function request(url, init = {}) {
    let response;
    try { response = await fetchImpl(String(url), { redirect: 'error', ...init }); }
    catch { throw new FacebookProviderError('NETWORK_ERROR', { retryable: true }); }
    const payload = await readJson(response);
    if (!response.ok) throw providerError(response.status, payload);
    return payload;
  }

  async function getGraph(path, { accessToken, query = {}, versioned = true } = {}) {
    const url = graphUrl(path, { apiVersion, versioned, query });
    const headers = { accept: 'application/json' };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    return request(url, { method: 'GET', headers });
  }

  async function postGraph(path, { accessToken, body = {}, versioned = true } = {}) {
    const url = graphUrl(path, { apiVersion, versioned });
    const headers = { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    return request(url, { method: 'POST', headers, body: formBody(body) });
  }

  async function postHostedVideo(uploadUrl, { accessToken, fileUrl } = {}) {
    const target = new URL(String(uploadUrl ?? ''));
    const source = new URL(String(fileUrl ?? ''));
    if (target.protocol !== 'https:' || target.hostname !== REEL_UPLOAD_HOST || source.protocol !== 'https:') {
      throw new FacebookProviderError('INVALID_MEDIA');
    }
    return request(target, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `OAuth ${accessToken}`,
        file_url: source.toString()
      }
    });
  }

  return { getGraph, postGraph, postHostedVideo };
}
