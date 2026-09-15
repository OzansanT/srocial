const API_ORIGIN = 'https://open.tiktokapis.com';

export class TikTokProviderError extends Error {
  constructor(code, { retryable = false, status = null } = {}) {
    super(`TikTok provider request failed (${code}).`);
    this.name = 'TikTokProviderError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

function normalizedProviderCode(payload) {
  return String(payload?.error?.code ?? '').trim().toLowerCase();
}

function providerError(status, payload) {
  const code = normalizedProviderCode(payload);
  if (status === 401 || code.includes('access_token') || code.includes('invalid_token')) return new TikTokProviderError('AUTH_ERROR', { status });
  if (status === 403 || code.includes('scope') || code.includes('permission')) return new TikTokProviderError('PERMISSION_DENIED', { status });
  if (status === 429 || code.includes('rate_limit') || code.includes('spam')) return new TikTokProviderError('RATE_LIMIT', { retryable: true, status });
  if (code.includes('url_ownership')) return new TikTokProviderError('MEDIA_URL_UNVERIFIED', { status });
  if (code.includes('privacy_level')) return new TikTokProviderError('PRIVACY_OPTION_UNAVAILABLE', { status });
  if (code.includes('photo') || code.includes('video') || code.includes('media') || code.includes('file_')) return new TikTokProviderError('MEDIA_ERROR', { status });
  return new TikTokProviderError('PROVIDER_ERROR', { retryable: status >= 500 || code.includes('internal'), status });
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw new TikTokProviderError('PROVIDER_ERROR', { retryable: response.status >= 500, status: response.status }); }
}

function apiUrl(path, query = {}) {
  const normalizedPath = `/${String(path ?? '').replace(/^\/+/, '')}`;
  const url = new URL(`${API_ORIGIN}${normalizedPath}`);
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

export function createTikTokClient({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('TIKTOK_FETCH_REQUIRED');

  async function request(url, init = {}) {
    let response;
    try { response = await fetchImpl(String(url), { redirect: 'error', ...init }); }
    catch { throw new TikTokProviderError('NETWORK_ERROR', { retryable: true }); }
    const payload = await readJson(response);
    const providerCode = normalizedProviderCode(payload);
    if (!response.ok || (providerCode && providerCode !== 'ok')) throw providerError(response.status, payload);
    return payload;
  }

  async function formPost(path, fields = {}) {
    return request(apiUrl(path), {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: formBody(fields)
    });
  }

  async function getApi(path, { accessToken, query = {} } = {}) {
    const headers = { accept: 'application/json' };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    return request(apiUrl(path, query), { method: 'GET', headers });
  }

  async function postApi(path, { accessToken, query = {}, body = {} } = {}) {
    const headers = { accept: 'application/json', 'content-type': 'application/json' };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    return request(apiUrl(path, query), { method: 'POST', headers, body: JSON.stringify(body) });
  }

  return { formPost, getApi, postApi };
}
