import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonRepository } from '../server/db/json-repository.js';

async function withRepository(faultInjector, run) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-v18-atomic-'));
  const filePath = join(directory, 'data.json');
  const repository = createJsonRepository({ filePath, faultInjector });
  await repository.initialize();
  try {
    await run(repository);
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
}

const timestamp = '2026-09-14T12:30:00.000Z';
const scheduledAt = '2026-09-15T12:30:00.000Z';

function socialGraph() {
  return {
    post: { caption: 'Atomic post', scheduledAt, createdAt: timestamp, updatedAt: timestamp },
    media: [{ type: 'image', url: 'https://cdn.example.test/atomic.jpg', sortOrder: 0, metadata: {}, createdAt: timestamp }],
    publicationPlans: [{
      publication: {
        accountId: null,
        platform: 'instagram',
        state: 'SCHEDULED',
        scheduledAt,
        providerOptions: {},
        externalId: null,
        externalUrl: null,
        errorCode: null,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      job: {
        type: 'SOCIAL_PUBLICATION',
        accountId: null,
        state: 'SCHEDULED',
        scheduledAt,
        attempts: 0,
        lockedAt: null,
        lockedBy: null,
        errorCode: null,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    }]
  };
}

function whatsappGraph() {
  return {
    campaign: {
      userId: null,
      accountId: null,
      templateId: null,
      name: 'Atomic campaign',
      state: 'SCHEDULED',
      scheduledAt,
      templateComponents: [],
      createdAt: timestamp,
      updatedAt: timestamp
    },
    recipients: [{ contactId: 'contact-1', state: 'QUEUED', createdAt: timestamp }],
    job: {
      type: 'WHATSAPP_CAMPAIGN',
      state: 'SCHEDULED',
      scheduledAt,
      attempts: 0,
      lockedAt: null,
      lockedBy: null,
      errorCode: null,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  };
}

test('JSON social scheduling publishes the complete graph in one mutation', async () => {
  await withRepository(null, async (repository) => {
    const result = await repository.createSocialScheduleGraph(socialGraph());
    assert.equal(result.media[0].postId, result.post.id);
    assert.equal(result.publications[0].postId, result.post.id);
    assert.equal(result.jobs[0].publicationId, result.publications[0].id);
    assert.equal((await repository.listPostsWithPublications()).length, 1);
    assert.equal((await repository.listJobs()).length, 1);
  });
});

test('JSON social scheduling rolls back the candidate graph when a mid-write checkpoint fails', async () => {
  await withRepository((checkpoint) => {
    if (checkpoint === 'social:after-publication') throw new Error('INJECTED_SOCIAL_GRAPH_FAILURE');
  }, async (repository) => {
    await assert.rejects(async () => repository.createSocialScheduleGraph(socialGraph()), /INJECTED_SOCIAL_GRAPH_FAILURE/);
    assert.equal((await repository.listPostsWithPublications()).length, 0);
    assert.equal((await repository.listMedia()).length, 0);
    assert.equal((await repository.listJobs()).length, 0);
  });
});

test('JSON WhatsApp scheduling rolls back campaign, recipients and job together', async () => {
  await withRepository((checkpoint) => {
    if (checkpoint === 'whatsapp:after-recipient') throw new Error('INJECTED_WHATSAPP_GRAPH_FAILURE');
  }, async (repository) => {
    await assert.rejects(async () => repository.createWhatsAppCampaignGraph(whatsappGraph()), /INJECTED_WHATSAPP_GRAPH_FAILURE/);
    assert.equal((await repository.listCampaigns()).length, 0);
    assert.equal((await repository.listJobs()).length, 0);
  });
});
