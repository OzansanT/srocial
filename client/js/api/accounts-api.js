import { requestJson } from './client.js';

export function listAccounts() {
  return requestJson('/api/accounts');
}
