import test from 'node:test';
import assert from 'node:assert/strict';
import { getOperationsPayload } from '../server/routes/operations.js';

const repository = {
  async listProviderStatuses() {
    return [{ provider:'instagram', healthState:'DEGRADED', lastSuccessAt:null, lastErrorAt:'2026-09-14T12:00:00.000Z', lastErrorCode:'RATE_LIMIT', limitedUntil:'2026-09-14T12:05:00.000Z', updatedAt:'2026-09-14T12:00:00.000Z' }];
  },
  async listJobs() {
    return [
      { id:'job-2', type:'SOCIAL_PUBLICATION', publicationId:'pub-2', accountId:null, state:'FAILED', scheduledAt:'2026-09-14T11:00:00.000Z', attempts:3, errorCode:'AUTH_ERROR', updatedAt:'2026-09-14T12:02:00.000Z' },
      { id:'job-1', type:'SOCIAL_PUBLICATION', publicationId:'pub-1', accountId:null, state:'COMPLETED', scheduledAt:'2026-09-14T10:00:00.000Z', attempts:1, errorCode:null, updatedAt:'2026-09-14T10:01:00.000Z' }
    ];
  },
  async listPublicationAttempts() {
    return [{ id:'attempt-1', publicationId:'pub-2', attempt:3, state:'FAILED', providerErrorCode:'AUTH_ERROR', errorMessage:null, startedAt:'2026-09-14T12:01:00.000Z', finishedAt:'2026-09-14T12:02:00.000Z' }];
  },
  async listWebhookEvents() {
    return [{ id:'evt-1', provider:'tiktok', externalEventId:'sha256:abc', eventType:'post.publish.complete', payload:{ secret:'must-not-leak' }, signatureValid:true, processingState:'PROCESSED', errorCode:null, receivedAt:'2026-09-14T12:03:00.000Z', processedAt:'2026-09-14T12:03:01.000Z' }];
  },
  async healthCheck() {
    return { ok:true, backend:'json' };
  }
};

const mediaStore = {
  async healthCheck() {
    return { ok:true, backend:'local', writable:true, errorCode:null };
  }
};

const schedulerLoop = {
  status() {
    return {
      configured:true,
      running:true,
      stopped:false,
      inFlight:false,
      intervalMs:30000,
      lastTickStartedAt:'2026-09-14T12:04:00.000Z',
      lastSuccessfulTickAt:'2026-09-14T12:04:01.000Z',
      lastFailedTickAt:null,
      lastErrorCode:null
    };
  }
};

test('operations payload preserves summaries and adds sanitized runtime/environment diagnostics', async () => {
  const result=await getOperationsPayload(repository, {
    mediaStore,
    schedulerLoop,
    environment:{ DATABASE_DRIVER:'json', MEDIA_STORAGE_DRIVER:'local' }
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.providers.length, 4);
  assert.equal(result.payload.providers.find((item)=>item.provider==='instagram').healthState, 'DEGRADED');
  assert.equal(result.payload.failedJobs.length, 1);
  assert.equal(result.payload.failedJobs[0].errorCode, 'AUTH_ERROR');
  assert.equal(result.payload.attempts.length, 1);
  assert.equal(result.payload.webhooks.length, 1);
  assert.equal('payload' in result.payload.webhooks[0], false);
  assert.equal(result.payload.webhooks[0].eventType, 'post.publish.complete');
  assert.deepEqual(result.payload.runtime.database, { ok:true, backend:'json' });
  assert.deepEqual(result.payload.runtime.storage, { ok:true, backend:'local', writable:true, errorCode:null });
  assert.equal(result.payload.runtime.scheduler.running, true);
  assert.equal(result.payload.runtime.scheduler.lastSuccessfulTickAt, '2026-09-14T12:04:01.000Z');
  assert.deepEqual(result.payload.environment, { ok:true, issues:[] });
});

test('operations payload degrades failed infrastructure probes without hiding existing summaries', async () => {
  const failingRepository = {
    ...repository,
    async healthCheck() { throw new Error('database-secret-details'); }
  };
  const failingMediaStore = {
    async healthCheck() { throw new Error('storage-secret-details'); }
  };
  const failingScheduler = {
    status() { throw new Error('scheduler-internal-details'); }
  };

  const result=await getOperationsPayload(failingRepository, {
    mediaStore:failingMediaStore,
    schedulerLoop:failingScheduler,
    environment:{ APP_AUTH_ENABLED:'true' }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.providers.length, 4);
  assert.deepEqual(result.payload.runtime.database, { ok:false, backend:'unavailable' });
  assert.deepEqual(result.payload.runtime.storage, { ok:false, backend:'unavailable', writable:false, errorCode:'MEDIA_STORAGE_UNAVAILABLE' });
  assert.deepEqual(result.payload.runtime.scheduler, {
    configured:false,
    running:false,
    stopped:true,
    inFlight:false,
    intervalMs:null,
    lastTickStartedAt:null,
    lastSuccessfulTickAt:null,
    lastFailedTickAt:null,
    lastErrorCode:'SCHEDULER_STATUS_UNAVAILABLE'
  });
  assert.equal(result.payload.environment.ok, false);
  assert.ok(result.payload.environment.issues.some((issue)=>issue.code==='ADMIN_PASSWORD_REQUIRED'));
  assert.ok(result.payload.environment.issues.some((issue)=>issue.code==='SESSION_SECRET_REQUIRED'));
  const serialized=JSON.stringify(result.payload);
  assert.equal(serialized.includes('database-secret-details'), false);
  assert.equal(serialized.includes('storage-secret-details'), false);
  assert.equal(serialized.includes('scheduler-internal-details'), false);
});