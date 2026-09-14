import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonRepository } from '../server/db/json-repository.js';

async function repositoryFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-v16-'));
  const repository = createJsonRepository({ filePath: join(directory, 'data.json') });
  await repository.initialize();
  return { repository, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test('JSON repository persists publication attempts, webhook events, provider status, and external-id lookup', async () => {
  const { repository, cleanup } = await repositoryFixture();
  try {
    const publication = await repository.createPublication({
      postId: 'post-1', accountId: 'account-1', platform: 'tiktok', state: 'PROCESSING',
      scheduledAt: '2026-09-14T12:00:00.000Z', providerOptions: {}, externalId: 'publish-123',
      externalUrl: null, errorCode: null, createdAt: '2026-09-14T11:00:00.000Z', updatedAt: '2026-09-14T11:00:00.000Z'
    });

    assert.equal((await repository.findPublicationByExternalId('tiktok', 'publish-123')).id, publication.id);

    const attempt = await repository.createPublicationAttempt({
      publicationId: publication.id, attempt: 1, state: 'PUBLISHING', providerErrorCode: null,
      errorMessage: null, startedAt: '2026-09-14T11:01:00.000Z', finishedAt: null
    });
    await repository.updatePublicationAttempt(attempt.id, {
      state: 'PUBLISHED', finishedAt: '2026-09-14T11:01:02.000Z'
    });
    const attempts = await repository.listPublicationAttempts({ limit: 10 });
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].state, 'PUBLISHED');

    const webhook = await repository.createWebhookEvent({
      provider: 'tiktok', externalEventId: 'sha256:abc', eventType: 'post.publish.complete',
      payload: { event: 'post.publish.complete' }, signatureValid: true,
      processingState: 'RECEIVED', errorCode: null, receivedAt: '2026-09-14T11:02:00.000Z', processedAt: null
    });
    assert.equal((await repository.getWebhookEventByExternalId('tiktok', 'sha256:abc')).id, webhook.id);
    await repository.updateWebhookEvent(webhook.id, {
      processingState: 'PROCESSED', processedAt: '2026-09-14T11:02:01.000Z'
    });
    const events = await repository.listWebhookEvents({ limit: 10 });
    assert.equal(events[0].processingState, 'PROCESSED');

    await repository.upsertProviderStatus('tiktok', {
      healthState: 'DEGRADED', lastErrorCode: 'RATE_LIMIT',
      limitedUntil: '2026-09-14T11:10:00.000Z', updatedAt: '2026-09-14T11:03:00.000Z'
    });
    await repository.upsertProviderStatus('tiktok', {
      healthState: 'HEALTHY', lastSuccessAt: '2026-09-14T11:04:00.000Z',
      lastErrorCode: null, limitedUntil: null, updatedAt: '2026-09-14T11:04:00.000Z'
    });
    const statuses = await repository.listProviderStatuses();
    assert.equal(statuses.length, 1);
    assert.equal(statuses[0].provider, 'tiktok');
    assert.equal(statuses[0].healthState, 'HEALTHY');
    assert.equal(statuses[0].lastErrorCode, null);
  } finally {
    await cleanup();
  }
});