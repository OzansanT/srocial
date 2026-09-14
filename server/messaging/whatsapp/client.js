const GRAPH_ORIGIN = 'https://graph.facebook.com';
const AUTH_CODES = new Set([190]);
const PERMISSION_CODES = new Set([10, 200]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

export class WhatsAppProviderError extends Error {
  constructor(code, { retryable = false, status = null } = {}) {
    super(`WhatsApp provider request failed (${code}).`);
    this.name = 'WhatsAppProviderError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

function providerError(status, payload) {
  const providerCode = Number(payload?.error?.code);
  if (status === 401 || AUTH_CODES.has(providerCode)) return new WhatsAppProviderError('AUTH_ERROR', { status });
  if (status === 403 || PERMISSION_CODES.has(providerCode)) return new WhatsAppProviderError('PERMISSION_DENIED', { status });
  if (status === 429 || RATE_LIMIT_CODES.has(providerCode)) return new WhatsAppProviderError('RATE_LIMIT', { retryable: true, status });
  return new WhatsAppProviderError('PROVIDER_ERROR', { retryable: status >= 500, status });
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw new WhatsAppProviderError('PROVIDER_ERROR', { retryable: response.status >= 500, status: response.status }); }
}

function graphUrl(path, { apiVersion, query = {} } = {}) {
  const normalizedPath = `/${String(path ?? '').replace(/^\/+/, '')}`;
  const url = new URL(`${GRAPH_ORIGIN}/${apiVersion}${normalizedPath}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url;
}

export function createWhatsAppClient({ config, fetchImpl = globalThis.fetch } = {}) {
  if (!config?.accessToken) throw new Error('WHATSAPP_CONFIG_REQUIRED');
  if (typeof fetchImpl !== 'function') throw new Error('WHATSAPP_FETCH_REQUIRED');

  async function request(url, init = {}) {
    let response;
    try { response = await fetchImpl(String(url), { redirect: 'error', ...init }); }
    catch { throw new WhatsAppProviderError('NETWORK_ERROR', { retryable: true }); }
    const payload = await readJson(response);
    if (!response.ok) throw providerError(response.status, payload);
    return payload;
  }

  async function get(path, { query = {} } = {}) {
    const url = graphUrl(path, { apiVersion: config.graphApiVersion, query });
    return request(url, {
      method: 'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${config.accessToken}` }
    });
  }

  async function post(path, body = {}) {
    const url = graphUrl(path, { apiVersion: config.graphApiVersion });
    return request(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${config.accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }

  return { get, post };
}
