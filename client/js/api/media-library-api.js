import { requestJson } from './client.js';

export function listMediaAssets() {
  return requestJson('/api/media');
}

export function deleteMediaAsset(key) {
  return requestJson(`/api/media/${encodeURIComponent(String(key ?? ''))}`, { method: 'DELETE' });
}
