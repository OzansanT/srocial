const GRAPH_ORIGIN = 'https://graph.threads.net';
const AUTH_CODES = new Set([190]);
const PERMISSION_CODES = new Set([10, 200]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

export class ThreadsProviderError extends Error {
  constructor(code, { retryable = false, status = null } = {}) {
    super(`Threads provider request failed (${code}).`);
    this.name = 'ThreadsProviderError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

function providerError(status, payload) {
  const providerCode = Number(payload?.error?.code);
  if (status === 401 || AUTH_CODES.has(providerCode)) return new ThreadsProviderError('AUTH_ERROR', { status });
  if (status === 403 || PERMISSION_CODES.has(providerCode)) return new ThreadsProviderError('PERMISSION_DENIED', { status });
  if (status === 429 || RATE_LIMIT_CODES.has(providerCode)) return new ThreadsProviderError('RATE_LIMIT', { retryable: true, status });
  return new ThreadsProviderError('PROVIDER_ERROR', { retryable: status >= 500, status });
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new ThreadsProviderError('PROVIDER_ERROR', { retryable: response.status >= 500, status: response.status }); }
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

export function createThreadsClient({ fetchImpl = globalThis.fetch, apiVersion = 'v1.0' } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('THREADS_FETCH_REQUIRED');

  async function request(url, init = {}) {
    let response;
    try { response = await fetchImpl(String(url), { redirect: 'error', ...init }); }
    catch { throw new ThreadsProviderError('NETWORK_ERROR', { retryable: true }); }
    const payload = await readJson(response);
    if (!response.ok) throw providerError(response.status, payload);
    return payload;
  }

  async function formPost(url, fields = {}) {
    const target = new URL(String(url ?? ''));
    if (target.protocol !== 'https:' || target.hostname !== 'graph.threads.net') throw new ThreadsProviderError('PROVIDER_ERROR');
    return request(target, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: formBody(fields)
    });
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

  return { formPost, getGraph, postGraph };
}
