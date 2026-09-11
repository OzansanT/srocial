import { cleanupOrphanMedia } from '../services/media-retention-service.js';

const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MAX_DELETES = 100;
const MIN_INTERVAL_MS = 1000;

function toEnabled(value) {
  return value === true || String(value ?? '').trim().toLowerCase() === 'true';
}

function normalizePositive(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function startMediaRetentionLoop({
  enabled = false,
  repository,
  mediaStore,
  retentionMs = DEFAULT_RETENTION_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
  maxDeletes = DEFAULT_MAX_DELETES,
  now = () => new Date(),
  cleanup = cleanupOrphanMedia,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  logger = console
} = {}) {
  if (!toEnabled(enabled)) return { started: false, stop() {} };
  if (!repository || !mediaStore || typeof cleanup !== 'function') throw new Error('MEDIA_RETENTION_RUNTIME_DEPENDENCIES_REQUIRED');

  const normalizedRetentionMs = normalizePositive(retentionMs, DEFAULT_RETENTION_MS);
  const normalizedIntervalMs = Math.max(MIN_INTERVAL_MS, normalizePositive(intervalMs, DEFAULT_INTERVAL_MS));
  const normalizedMaxDeletes = normalizePositive(maxDeletes, DEFAULT_MAX_DELETES);
  let inFlight = false;
  let stopped = false;

  async function runOnce() {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      await cleanup({
        repository,
        mediaStore,
        now: now(),
        retentionMs: normalizedRetentionMs,
        maxDeletes: normalizedMaxDeletes
      });
    } catch (error) {
      logger?.error?.('Media retention cleanup failed', { code: error?.code ?? 'MEDIA_RETENTION_CLEANUP_ERROR' });
    } finally {
      inFlight = false;
    }
  }

  const timer = setIntervalImpl(runOnce, normalizedIntervalMs);

  return {
    started: true,
    stop() {
      if (stopped) return;
      stopped = true;
      clearIntervalImpl(timer);
    }
  };
}
