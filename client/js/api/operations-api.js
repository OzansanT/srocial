import { requestJson } from './client.js';

export function getOperations() {
  return requestJson('/api/operations');
}
