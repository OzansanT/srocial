import { requestJson } from './client.js';

const MEDIA_TYPES = new Set(['image', 'video']);

export function describeUploadedMedia(upload = {}) {
  const url = String(upload.url ?? '').trim();
  const type = String(upload.type ?? '').trim().toLowerCase();
  if (!url || !MEDIA_TYPES.has(type)) throw new Error('INVALID_MEDIA_UPLOAD');

  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('INVALID_MEDIA_UPLOAD'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('INVALID_MEDIA_UPLOAD');

  if (parsed.protocol === 'https:') {
    return { url, type, state: 'success', message: 'Media uploaded.' };
  }

  return {
    url,
    type,
    state: 'warning',
    message: 'Media uploaded locally. Configure a public HTTPS PUBLIC_BASE_URL before scheduling provider publishing.'
  };
}

export function uploadMedia(file) {
  if (!file) return Promise.reject(new Error('MEDIA_FILE_REQUIRED'));
  return requestJson('/api/media/uploads', {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file
  });
}
