import { requestJson } from './client.js';

export function getHealth() {
  return requestJson('/api/health');
}

export function getDashboard() {
  return requestJson('/api/dashboard');
}
