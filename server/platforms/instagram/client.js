const GRAPH_ORIGIN = 'https://graph.instagram.com';

function classifyProviderError(status, providerCode) {
  if (status === 401 || Number(providerCode) === 190) return { code: 'AUTH_ERROR', retryable: false };
  if (status === 403 || [10, 200].includes(Number(providerCode))) return { code: 'PERMISSION_DENIED', retryable: false };
  if (status === 429 || [4, 17, 32, 613].includes(Number(providerCode))) return { code: 'RATE_LIMIT', retryable: true };
  if (status >= 500) return { code: 'PROVIDER_ERROR', retryable: true };
  return { code: 'PROVIDER_ERROR', retryable: false };
}

export class InstagramProviderError extends Error {
  constructor({ code, retryable = false, status = 0, providerCode = null, providerSubcode = null } = {}) {
    super(`Instagram provider request failed (${code ?? 'PROVIDER_ERROR'})`);
    this.name = 'InstagramProviderError';
    this.code = code ?? 'PROVIDER_ERROR';
    this.retryable = Boolean(retryable);
    this.status = status;
    this.providerCode = providerCode;
    this.providerSubcode = providerSubcode;
  }
}

function normalizeVersion(value) {
  const raw = String(value ?? 'v26.0').trim() || 'v26.0';
  return raw.startsWith('v') ? raw : `v${raw}`;
}

function encodeFields(fields = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  return params;
}

export function createInstagramClient({ fetchImpl = globalThis.fetch, apiVersion = 'v26.0' } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('INSTAGRAM_FETCH_REQUIRED');
  const version = normalizeVersion(apiVersion);

  async function request(url, options) {
    let response;
    try {
      response = await fetchImpl(url, options);
    } catch {
      throw new InstagramProviderError({ code: 'NETWORK_ERROR', retryable: true });
    }

    let payload = {};
    try {
      const raw = await response.text();
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const providerCode = payload?.error?.code ?? null;
      const providerSubcode = payload?.error?.error_subcode ?? null;
      const mapped = classifyProviderError(response.status, providerCode);
      throw new InstagramProviderError({ ...mapped, status: response.status, providerCode, providerSubcode });
    }
    return payload;
  }

  function graphUrl(path, query = {}, { versioned = true } = {}) {
    const cleanPath = `/${String(path ?? '').replace(/^\/+/, '')}`;
    const prefix = versioned ? `/${version}` : '';
    const url = new URL(`${GRAPH_ORIGIN}${prefix}${cleanPath}`);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
    return url;
  }

  return {
    apiVersion: version,
    async formPost(url, fields) {
      return request(String(url), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: encodeFields(fields).toString()
      });
    },
    async getGraph(path, { query = {}, accessToken = null, versioned = true } = {}) {
      const headers = {};
      if (accessToken) headers.authorization = `Bearer ${accessToken}`;
      return request(graphUrl(path, query, { versioned }).toString(), { method: 'GET', headers });
    },
    async postGraph(path, { body = {}, accessToken = null, versioned = true } = {}) {
      const headers = { 'content-type': 'application/x-www-form-urlencoded' };
      if (accessToken) headers.authorization = `Bearer ${accessToken}`;
      return request(graphUrl(path, {}, { versioned }).toString(), {
        method: 'POST',
        headers,
        body: encodeFields(body).toString()
      });
    }
  };
}
