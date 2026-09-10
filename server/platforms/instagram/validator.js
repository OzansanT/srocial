function invalidMedia() {
  const error = new Error('INVALID_MEDIA');
  error.code = 'INVALID_MEDIA';
  error.retryable = false;
  return error;
}

export function validateInstagramPublication({ post, media } = {}) {
  if (!Array.isArray(media) || media.length !== 1) throw invalidMedia();
  const item = media[0] ?? {};
  const type = String(item.type ?? '').trim().toLowerCase();
  if (type !== 'image' && type !== 'video') throw invalidMedia();
  let url;
  try { url = new URL(String(item.url ?? '')); } catch { throw invalidMedia(); }
  if (url.protocol !== 'https:') throw invalidMedia();
  return { type, url: url.toString(), caption: typeof post?.caption === 'string' ? post.caption.trim() : '' };
}
