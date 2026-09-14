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
  logger = console
} = {}) {
  const allowedJobTypes = allowedTypes({ allowRealPublish, allowRealWhatsApp });
  if (!toEnabled(enabled) || allowedJobTypes.length === 0) {
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
      await tick({
        repository,
        registry,
        messagingRegistry,
        oauthRegistry,
        tokenCipher,
        allowedJobTypes,
        workerId,
        now: new Date()
      });
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
