import test from 'node:test';
import assert from 'node:assert/strict';
import { createComposerWorkflowService } from '../server/services/composer-workflow-service.js';

function repositoryFixture() {
  const accounts = new Map([
    ['fb-1', { id: 'fb-1', provider: 'facebook', state: 'CONNECTED' }],
    ['th-1', { id: 'th-1', provider: 'threads', state: 'CONNECTED' }]
  ]);
  return {
    createDraft: async (record) => ({ id: 'draft-1', ...record }),
    getDraft: async () => null,
    listDrafts: async () => [],
    updateDraft: async () => null,
    deleteDraft: async () => false,
    createCaptionTemplate: async (record) => ({ id: 'tpl-1', ...record }),
    listCaptionTemplates: async () => [],
    deleteCaptionTemplate: async () => false,
    createHashtagCollection: async (record) => ({ id: 'hash-1', ...record }),
    listHashtagCollections: async () => [],
    deleteHashtagCollection: async () => false,
    createDestinationGroup: async (record) => ({ id: 'grp-1', ...record }),
    listDestinationGroups: async () => [],
    deleteDestinationGroup: async () => false,
    getAccount: async (id) => accounts.get(id) ?? null
  };
}

test('draft creation accepts incomplete composer state and starts revision 1', async () => {
  const service = createComposerWorkflowService({ repository: repositoryFixture() });
  const draft = await service.createDraft({ name: 'Idea', caption: '', media: [], destinations: [], platformOverrides: {} }, { now: new Date('2026-09-14T13:00:00.000Z') });
  assert.equal(draft.revision, 1);
  assert.equal(draft.caption, '');
  assert.equal(draft.scheduledAt, null);
});

test('hashtag collection normalizes hashes, whitespace, and duplicates', async () => {
  const service = createComposerWorkflowService({ repository: repositoryFixture() });
  const collection = await service.createHashtagCollection({ name: 'Pets', tags: ['pet', '#cat', ' #pet '] }, { now: new Date('2026-09-14T13:00:00.000Z') });
  assert.deepEqual(collection.tags, ['#pet', '#cat']);
});

test('compatibility reports effective override lengths and account/media issues per destination', async () => {
  const service = createComposerWorkflowService({ repository: repositoryFixture() });
  const result = await service.compatibility({
    caption: 'Base',
    scheduledAt: '2026-09-15T10:00:00.000Z',
    media: [],
    destinations: [
      { platform: 'facebook', accountId: 'fb-1' },
      { platform: 'threads', accountId: 'th-1', captionOverride: 'x'.repeat(501), mediaOverride: [] }
    ]
  }, { now: new Date('2026-09-14T13:00:00.000Z') });

  assert.equal(result.destinations.length, 2);
  const facebook = result.destinations.find((item) => item.platform === 'facebook');
  const threads = result.destinations.find((item) => item.platform === 'threads');
  assert.equal(facebook.compatible, true);
  assert.equal(facebook.captionLimit, 63206);
  assert.equal(threads.captionLimit, 500);
  assert.equal(threads.captionLength, 501);
  assert.equal(threads.compatible, false);
  assert.ok(threads.issues.some((issue) => issue.code === 'CAPTION_TOO_LONG'));
});