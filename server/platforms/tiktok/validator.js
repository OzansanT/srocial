function validationError(code) {
  const error = new Error(code);
  error.code = code;
  error.retryable = false;
  return error;
}

const PRIVACY_LEVELS = new Set([
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY'
]);

export function validateTikTokPost({ post, media, options } = {}) {
  const items = Array.isArray(media) ? media : [];
  if (items.length === 0) throw validationError('MEDIA_REQUIRED');
  if (items.length !== 1) throw validationError('MEDIA_COUNT_UNSUPPORTED');
  const item = items[0];
  if (!['image', 'video'].includes(item?.type)) throw validationError('MEDIA_TYPE_UNSUPPORTED');
  try {
    const url = new URL(String(item?.url ?? ''));
    if (url.protocol !== 'https:') throw new Error('https required');
  } catch {
    throw validationError('MEDIA_URL_INVALID');
  }

  const normalizedOptions = options && typeof options === 'object' ? options : {};
  const privacyLevel = String(normalizedOptions.privacyLevel ?? '').trim();
  if (!PRIVACY_LEVELS.has(privacyLevel)) throw validationError('PRIVACY_LEVEL_REQUIRED');
  if (normalizedOptions.consent !== true) throw validationError('CONSENT_REQUIRED');

  const caption = String(post?.caption ?? '');
  const maxCaption = item.type === 'video' ? 2200 : 4000;
  if (caption.length > maxCaption) throw validationError('CAPTION_TOO_LONG');

  return {
    media: { type: item.type, url: String(item.url) },
    caption,
    options: {
      privacyLevel,
      allowComment: normalizedOptions.allowComment === true,
      allowDuet: normalizedOptions.allowDuet === true,
      allowStitch: normalizedOptions.allowStitch === true,
      commercialContent: normalizedOptions.commercialContent === true,
      brandOrganic: normalizedOptions.brandOrganic === true,
      brandContent: normalizedOptions.brandContent === true,
      isAigc: normalizedOptions.isAigc === true,
      consent: true
    }
  };
}
