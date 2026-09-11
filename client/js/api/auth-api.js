import { requestJson } from './client.js';

export function login(username, password) {
  return requestJson('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
}

export function getSession() {
  return requestJson('/api/auth/session');
}

export function logout() {
  return requestJson('/api/auth/logout', { method: 'POST' });
}
