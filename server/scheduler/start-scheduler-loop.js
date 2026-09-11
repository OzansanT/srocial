import { randomUUID } from 'node:crypto';

const MIN_INTERVAL_MS = 1000;
const DEFAULT_INTERVAL_MS = 30000;

function toEnabled(value) {
  return value === true || String(value ?? '').trim().toLowerCase() === 'true';
}

function normalizeInterval(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_INTERVAL_MS;
  return Math.max(MIN_INTERVAL_MS, parsed);
}

export function startSchedulerLoop({
  enabled = false,
  allowRealPublish = false,
  repository,
  registry,
  oauthRegistry,
  tokenCipher,
  intervalMs = DEFAULT_INTERVAL_MS,
  workerId = `scheduler-${randomUUID()}`,
  tick,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  logger = console
} = {}) {
  if (!toEnabled(enabled) || !toEnabled(allowRealPublish)) {
    return { started: false, stop() {} };
  }
  if (!repository || !registry || typeof tick !== 'function') {
    throw new Error('SCHEDULER_RUNTIME_DEPENDENCIES_REQUIRED');
  }

  let inFlight = false;
  let stopped = false;

  async function runOnce() {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      await tick({ repository, registry, oauthRegistry, tokenCipher, workerId, now: new Date() });
    } catch (error) {
      logger?.error?.('Scheduler tick failed', { code: error?.code ?? 'SCHEDULER_TICK_ERROR' });
    } finally {
      inFlight = false;
    }
  }

  const timer = setIntervalImpl(runOnce, normalizeInterval(intervalMs));

  return {
    started: true,
    workerId,
    stop() {
      if (stopped) return;
      stopped = true;
      clearIntervalImpl(timer);
    }
  };
}
