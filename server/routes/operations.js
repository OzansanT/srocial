import { diagnoseEnvironment } from '../operations/environment-diagnostics.js';
import { buildOperationsSummary } from '../services/operations-service.js';

const DATABASE_BACKENDS = new Set(['json', 'postgres']);
const STORAGE_BACKENDS = new Set(['local', 's3']);

function unavailableDatabase() {
  return { ok:false, backend:'unavailable' };
}

function unavailableStorage() {
  return { ok:false, backend:'unavailable', writable:false, errorCode:'MEDIA_STORAGE_UNAVAILABLE' };
}

function unavailableScheduler() {
  return {
    configured:false,
    running:false,
    stopped:true,
    inFlight:false,
    intervalMs:null,
    lastTickStartedAt:null,
    lastSuccessfulTickAt:null,
    lastFailedTickAt:null,
    lastErrorCode:'SCHEDULER_STATUS_UNAVAILABLE'
  };
}

async function readDatabaseHealth(repository) {
  try {
    if (typeof repository?.healthCheck !== 'function') return unavailableDatabase();
    const result = await repository.healthCheck();
    return {
      ok: result?.ok === true,
      backend: DATABASE_BACKENDS.has(result?.backend) ? result.backend : 'unavailable'
    };
  } catch {
    return unavailableDatabase();
  }
}

async function readStorageHealth(mediaStore) {
  try {
    if (typeof mediaStore?.healthCheck !== 'function') return unavailableStorage();
    const result = await mediaStore.healthCheck();
    const backend = STORAGE_BACKENDS.has(result?.backend) ? result.backend : 'unavailable';
    return {
      ok: result?.ok === true,
      backend,
      writable: result?.writable === true,
      errorCode: result?.errorCode == null ? null : String(result.errorCode)
    };
  } catch {
    return unavailableStorage();
  }
}

function safeTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function readSchedulerHealth(schedulerLoop) {
  try {
    if (typeof schedulerLoop?.status !== 'function') return unavailableScheduler();
    const result = schedulerLoop.status();
    return {
      configured: result?.configured === true,
      running: result?.running === true,
      stopped: result?.stopped === true,
      inFlight: result?.inFlight === true,
      intervalMs: Number.isFinite(result?.intervalMs) ? result.intervalMs : null,
      lastTickStartedAt: safeTimestamp(result?.lastTickStartedAt),
      lastSuccessfulTickAt: safeTimestamp(result?.lastSuccessfulTickAt),
      lastFailedTickAt: safeTimestamp(result?.lastFailedTickAt),
      lastErrorCode: result?.lastErrorCode == null ? null : String(result.lastErrorCode)
    };
  } catch {
    return unavailableScheduler();
  }
}

export async function getOperationsPayload(repository, {
  mediaStore = null,
  schedulerLoop = null,
  environment = {}
} = {}) {
  if (!repository) return { statusCode:503, payload:{ error:'repository_unavailable' } };
  try {
    const summary = await buildOperationsSummary(repository);
    const [database, storage] = await Promise.all([
      readDatabaseHealth(repository),
      readStorageHealth(mediaStore)
    ]);
    return {
      statusCode:200,
      payload:{
        ...summary,
        runtime:{
          database,
          storage,
          scheduler:readSchedulerHealth(schedulerLoop)
        },
        environment:diagnoseEnvironment(environment)
      }
    };
  } catch {
    return { statusCode:503, payload:{ error:'operations_unavailable' } };
  }
}
