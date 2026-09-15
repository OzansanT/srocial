import { requestJson } from './client.js';

export function listUsers() {
  return requestJson('/api/users');
}

export function createUser(input) {
  return requestJson('/api/users', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export function updateUser(id, patch) {
  return requestJson(`/api/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
}

export function changeUserPassword(id, password) {
  return requestJson(`/api/users/${encodeURIComponent(id)}/password`, {
    method: 'POST',
    body: JSON.stringify({ password })
  });
}

export function revokeUserSessions(id) {
  return requestJson(`/api/users/${encodeURIComponent(id)}/sessions/revoke`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}
