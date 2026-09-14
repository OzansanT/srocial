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
  }
};

test('operations payload returns sanitized provider, failed-work, attempt, and webhook summaries', async () => {
  const result=await getOperationsPayload(repository);
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.providers.length, 4);
  assert.equal(result.payload.providers.find((item)=>item.provider==='instagram').healthState, 'DEGRADED');
  assert.equal(result.payload.failedJobs.length, 1);
  assert.equal(result.payload.failedJobs[0].errorCode, 'AUTH_ERROR');
  assert.equal(result.payload.attempts.length, 1);
  assert.equal(result.payload.webhooks.length, 1);
  assert.equal('payload' in result.payload.webhooks[0], false);
  assert.equal(result.payload.webhooks[0].eventType, 'post.publish.complete');
});