function invalidMedia() {
  const error = new Error('INVALID_MEDIA');
  error.code = 'INVALID_MEDIA';
  error.retryable = false;
  return error;
}

function normalizeHttpsUrl(value) {
  let url;
  try { url = new URL(String(value ?? '')); } catch { throw invalidMedia(); }
  if (url.protocol !== 'https:') throw invalidMedia();
  return url.toString();
}

export function validateThreadsPost({ post = {}, media = [] } = {}) {
  if (!Array.isArray(media) || media.length > 1) throw invalidMedia();
  const text = String(post.caption ?? '').trim();

  if (media.length === 0) {
    if (!text) throw invalidMedia();
    return { text, media: null };
  }

  const item = media[0] ?? {};
  const type = String(item.type ?? '').trim().toLowerCase();
  if (type !== 'image' && type !== 'video') throw invalidMedia();
  return { text, media: { type, url: normalizeHttpsUrl(item.url) } };
}
