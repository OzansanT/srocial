import { getReferencedMediaKeys } from './media-library-service.js';

export class MediaRetentionError extends Error {
  constructor(code) {
    super(code);
    this.name = 'MediaRetentionError';
    this.code = code;
  }
}

function normalizeNow(value) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) throw new MediaRetentionError('MEDIA_RETENTION_CONFIG_INVALID');
  return date;
}

function requirePositiveInteger(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new MediaRetentionError('MEDIA_RETENTION_CONFIG_INVALID');
  return parsed;
}

export async function cleanupOrphanMedia({ repository, mediaStore, now = new Date(), retentionMs, maxDeletes } = {}) {
  if (!repository || !mediaStore || typeof mediaStore.list !== 'function' || typeof mediaStore.remove !== 'function' || typeof mediaStore.keyFromUrl !== 'function') {
    throw new MediaRetentionError('MEDIA_RETENTION_RUNTIME_DEPENDENCIES_REQUIRED');
  }

  const current = normalizeNow(now);
  const retention = requirePositiveInteger(retentionMs);
  const deleteLimit = requirePositiveInteger(maxDeletes);
  const cutoff = current.getTime() - retention;

  const [assets, referencedKeys] = await Promise.all([
    mediaStore.list(),
    getReferencedMediaKeys(repository, mediaStore)
  ]);

  const eligible = assets
    .filter((asset) => {
      if (!asset?.key || referencedKeys.has(asset.key)) return false;
      const modifiedMs = Date.parse(asset.modifiedAt);
      return Number.isFinite(modifiedMs) && modifiedMs < cutoff;
    })
    .sort((left, right) => Date.parse(left.modifiedAt) - Date.parse(right.modifiedAt) || String(left.key).localeCompare(String(right.key)));

  let deleted = 0;
  try {
    for (const asset of eligible.slice(0, deleteLimit)) {
      await mediaStore.remove(asset.key);
      deleted += 1;
    }
  } catch {
    throw new MediaRetentionError('MEDIA_RETENTION_CLEANUP_FAILED');
  }

  return {
    scanned: assets.length,
    eligible: eligible.length,
    deleted
  };
}
