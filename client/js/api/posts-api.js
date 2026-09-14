import { requestJson } from './client.js';

function jsonRequest(path, method, input) {
  return requestJson(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input ?? {})
  });
}

export function listPosts(filters = {}) {
  const params = new URLSearchParams();
  for (const key of ['platform', 'accountId', 'state', 'from', 'until']) {
    const value = String(filters?.[key] ?? '').trim();
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return requestJson(`/api/posts${query ? `?${query}` : ''}`);
}

export function createPost(input) {
  return jsonRequest('/api/posts', 'POST', input);
}

export function updatePost(id, input) {
  return jsonRequest(`/api/posts/${encodeURIComponent(id)}`, 'PATCH', input);
}

export function cancelPost(id) {
  return jsonRequest(`/api/posts/${encodeURIComponent(id)}/cancel`, 'POST', {});
}

export function duplicatePost(id, input) {
  return jsonRequest(`/api/posts/${encodeURIComponent(id)}/duplicate`, 'POST', input);
}

export function retryPublication(id, input = {}) {
  return jsonRequest(`/api/publications/${encodeURIComponent(id)}/retry`, 'POST', input);
}

export function bulkCancelPosts(postIds) {
  return jsonRequest('/api/posts/bulk/cancel', 'POST', { postIds });
}

export function bulkReschedulePosts(postIds, scheduledAt) {
  return jsonRequest('/api/posts/bulk/reschedule', 'POST', { postIds, scheduledAt });
}
