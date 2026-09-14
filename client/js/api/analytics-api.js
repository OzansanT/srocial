import { requestJson } from './client.js';

function queryString(filters = {}) {
  const params = new URLSearchParams();
  for (const key of ['from', 'until', 'platform', 'accountId']) {
    const value = String(filters[key] ?? '').trim();
    if (value) params.set(key, value);
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export function getAnalytics(filters = {}) {
  return requestJson(`/api/analytics${queryString(filters)}`);
}

export function refreshAnalytics(filters = {}) {
  return requestJson('/api/analytics/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(filters)
  });
}

export function refreshPublicationAnalytics(publicationId) {
  return requestJson(`/api/analytics/publications/${encodeURIComponent(publicationId)}/refresh`, { method: 'POST' });
}
