export const INSTAGRAM_MEDIA_LIMITS = Object.freeze({
  imageMinAspectRatio: 4 / 5,
  imageMaxAspectRatio: 1.91,
  imageMaxBytes: 8 * 1024 * 1024,
  videoMinDurationSeconds: 3,
  videoMaxDurationSeconds: 15 * 60,
  videoMaxBytes: 300 * 1024 * 1024
});

const ISSUE_MESSAGES = Object.freeze({
  INSTAGRAM_MEDIA_METADATA_REQUIRED: 'Instagram media must be stored in Srocial so its provider requirements can be verified.',
  INSTAGRAM_IMAGE_ASPECT_RATIO_UNSUPPORTED: 'Instagram images must use an aspect ratio from 4:5 through 1.91:1.',
  INSTAGRAM_VIDEO_DURATION_UNSUPPORTED: 'Instagram videos must be between 3 seconds and 15 minutes long.',
  INSTAGRAM_MEDIA_FILE_TOO_LARGE: 'Instagram media exceeds the supported file-size limit.'
});

function issue(code) {
  return { code, message: ISSUE_MESSAGES[code] };
}

function finitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

export function instagramMaxBytesForType(type) {
  const normalized = String(type ?? '').trim().toLowerCase();
  if (normalized === 'image') return INSTAGRAM_MEDIA_LIMITS.imageMaxBytes;
  if (normalized === 'video') return INSTAGRAM_MEDIA_LIMITS.videoMaxBytes;
  return null;
}

export function validateInstagramMediaMetadata(media, metadata) {
  const type = String(media?.type ?? '').trim().toLowerCase();
  if (type !== 'image' && type !== 'video') return [];

  if (!metadata || !finiteNonNegative(metadata.sizeBytes)) {
    return [issue('INSTAGRAM_MEDIA_METADATA_REQUIRED')];
  }

  const maxBytes = instagramMaxBytesForType(type);
  if (metadata.sizeBytes > maxBytes) {
    return [issue('INSTAGRAM_MEDIA_FILE_TOO_LARGE')];
  }

  if (type === 'image') {
    if (!finitePositive(metadata.width) || !finitePositive(metadata.height)) {
      return [issue('INSTAGRAM_MEDIA_METADATA_REQUIRED')];
    }
    const ratio = metadata.width / metadata.height;
    if (ratio < INSTAGRAM_MEDIA_LIMITS.imageMinAspectRatio || ratio > INSTAGRAM_MEDIA_LIMITS.imageMaxAspectRatio) {
      return [issue('INSTAGRAM_IMAGE_ASPECT_RATIO_UNSUPPORTED')];
    }
    return [];
  }

  if (!finiteNonNegative(metadata.durationSeconds)) {
    return [issue('INSTAGRAM_MEDIA_METADATA_REQUIRED')];
  }
  if (
    metadata.durationSeconds < INSTAGRAM_MEDIA_LIMITS.videoMinDurationSeconds ||
    metadata.durationSeconds > INSTAGRAM_MEDIA_LIMITS.videoMaxDurationSeconds
  ) {
    return [issue('INSTAGRAM_VIDEO_DURATION_UNSUPPORTED')];
  }
  return [];
}
