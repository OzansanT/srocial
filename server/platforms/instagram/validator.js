function invalidMedia() {
  const error = new Error('INVALID_MEDIA');
  error.code = 'INVALID_MEDIA';
  error.retryable = false;
  return error;
}

function normalizeItem(item) {
  const type = String(item?.type ?? '').trim().toLowerCase();
  if (type !== 'image' && type !== 'video') throw invalidMedia();
  let url;
  try { url = new URL(String(item?.url ?? '')); } catch { throw invalidMedia(); }
  if (url.protocol !== 'https:') throw invalidMedia();
  return { type, url: url.toString() };
}

export function validateInstagramPublication({ post, media } = {}) {
  if (!Array.isArray(media) || media.length < 1 || media.length > 10) throw invalidMedia();
  const normalized = media.map(normalizeItem);
  const caption = typeof post?.caption === 'string' ? post.caption.trim() : '';
  if (normalized.length === 1) {
    return { type: normalized[0].type, url: normalized[0].url, caption };
  }
  return { type: 'carousel', caption, media: normalized };
}
