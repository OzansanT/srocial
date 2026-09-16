import { randomUUID } from 'node:crypto';
import { JOB_TYPES } from './job-types.js';

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

function allowedTypes({ allowRealPublish, allowRealWhatsApp }) {
  const types = [];
  if (toEnabled(allowRealPublish)) {
    types.push(JOB_TYPES.SOCIAL_PUBLICATION, JOB_TYPES.STATUS_CHECK, JOB_TYPES.TOKEN_REFRESH);
  }
  if (toEnabled(allowRealWhatsApp)) types.push(JOB_TYPES.WHATSAPP_CAMPAIGN);
  return types;
}

function timestamp(now) {
  const value = now();
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function startSchedulerLoop({
  enabled = false,
  allowRealPublish = false,
  allowRealWhatsApp = false,
  repository,
  registry,
  messagingRegistry = new Map(),
  oauthRegistry,
  tokenCipher,
  intervalMs = DEFAULT_INTERVAL_MS,
  workerId = `scheduler-${randomUUID()}`,
  tick,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  logger = console,
  now = () => new Date()
} = {}) {
  const configured = toEnabled(enabled);
  const allowedJobTypes = allowedTypes({ allowRealPublish, allowRealWhatsApp });
  const normalizedInterval = normalizeInterval(intervalMs);
  let running = false;
  let stopped = true;
  let inFlight = false;
  let lastTickStartedAt = null;
  let lastSuccessfulTickAt = null;
  let lastFailedTickAt = null;
  let lastErrorCode = null;

  function status() {
    return {
      configured,
      running,
      stopped,
      inFlight,
      intervalMs: normalizedInterval,
      lastTickStartedAt,
      lastSuccessfulTickAt,
      lastFailedTickAt,
      lastErrorCode
    };
  }

  if (!configured || allowedJobTypes.length === 0) {
    return { started: false, status, stop() {} };
  }
  if (!repository || !registry || typeof tick !== 'function') {
    throw new Error('SCHEDULER_RUNTIME_DEPENDENCIES_REQUIRED');
  }

  running = true;
  stopped = false;

  async function runOnce() {
    if (stopped || inFlight) return;
    inFlight = true;
    lastTickStartedAt = timestamp(now);
    try {
      await tick({
        repository,
        registry,
        messagingRegistry,
        oauthRegistry,
        tokenCipher,
        allowedJobTypes,
        workerId,
        now: new Date(lastTickStartedAt)
      });
      lastSuccessfulTickAt = timestamp(now);
      lastErrorCode = null;
    } catch (error) {
      lastFailedTickAt = timestamp(now);
      lastErrorCode = error?.code ?? 'SCHEDULER_TICK_ERROR';
      logger?.error?.('Scheduler tick failed', { code: lastErrorCode });
    } finally {
      inFlight = false;
    }
  }

  const timer = setIntervalImpl(runOnce, normalizedInterval);

  return {
    started: true,
    workerId,
    status,
    stop() {
      if (stopped) return;
      stopped = true;
      running = false;
      clearIntervalImpl(timer);
    }
  };
}