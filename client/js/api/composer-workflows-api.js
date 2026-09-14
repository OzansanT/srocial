import { requestJson } from './client.js';

const apiJson = requestJson;

function jsonRequest(path, method, input) {
  return apiJson(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input ?? {})
  });
}

function remove(path) {
  return apiJson(path, { method: 'DELETE' });
}

export function listDrafts() { return apiJson('/api/composer/drafts'); }
export function getDraft(id) { return apiJson(`/api/composer/drafts/${encodeURIComponent(id)}`); }
export function createDraft(input) { return jsonRequest('/api/composer/drafts', 'POST', input); }
export function updateDraft(id, input) { return jsonRequest(`/api/composer/drafts/${encodeURIComponent(id)}`, 'PATCH', input); }
export function deleteDraft(id) { return remove(`/api/composer/drafts/${encodeURIComponent(id)}`); }

export function listCaptionTemplates() { return apiJson('/api/composer/caption-templates'); }
export function createCaptionTemplate(input) { return jsonRequest('/api/composer/caption-templates', 'POST', input); }
export function deleteCaptionTemplate(id) { return remove(`/api/composer/caption-templates/${encodeURIComponent(id)}`); }

export function listHashtagCollections() { return apiJson('/api/composer/hashtag-collections'); }
export function createHashtagCollection(input) { return jsonRequest('/api/composer/hashtag-collections', 'POST', input); }
export function deleteHashtagCollection(id) { return remove(`/api/composer/hashtag-collections/${encodeURIComponent(id)}`); }

export function listDestinationGroups() { return apiJson('/api/composer/destination-groups'); }
export function createDestinationGroup(input) { return jsonRequest('/api/composer/destination-groups', 'POST', input); }
export function deleteDestinationGroup(id) { return remove(`/api/composer/destination-groups/${encodeURIComponent(id)}`); }

export function checkCompatibility(input) {
  return jsonRequest('/api/composer/compatibility', 'POST', input);
}