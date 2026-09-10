import { requestJson } from './client.js';

export function listAccounts() {
  return requestJson('/api/accounts');
}

export function startOAuth(provider) {
  return requestJson(`/api/oauth/${encodeURIComponent(provider)}/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  });
}

export function disconnectAccount(id) {
  return requestJson(`/api/accounts/${encodeURIComponent(id)}/disconnect`, {
    method: 'POST'
  });
}
