import { requestJson } from './client.js';

export function listAccounts() {
  return requestJson('/api/accounts');
}

export function disconnectAccount(id) {
  return requestJson(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
