import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonRepository } from '../server/db/json-repository.js';

async function withRepository(run) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-v19-json-'));
  const repository = createJsonRepository({ filePath: join(directory, 'data.json') });
  await repository.initialize();
  try { await run(repository); }
  finally { await repository.close(); await rm(directory, { recursive: true, force: true }); }
}

test('JSON workflow repository round-trips drafts and rejects stale revisions without overwriting', async () => {
  await withRepository(async (repository) => {
    const draft = await repository.createDraft({
      name: 'Launch', caption: 'Base', scheduledAt: null, media: [], destinations: [], platformOverrides: {},
      revision: 1, createdAt: '2026-09-14T13:00:00.000Z', updatedAt: '2026-09-14T13:00:00.000Z'
    });
    assert.equal(draft.revision, 1);

    const updated = await repository.updateDraft(draft.id, { caption: 'New', updatedAt: '2026-09-14T13:01:00.000Z' }, 1);
    assert.equal(updated.caption, 'New');
    assert.equal(updated.revision, 2);

    await assert.rejects(
      repository.updateDraft(draft.id, { caption: 'Stale' }, 1),
      (error) => error?.code === 'DRAFT_REVISION_CONFLICT'
    );
    assert.equal((await repository.getDraft(draft.id)).caption, 'New');
    assert.equal((await repository.listDrafts()).length, 1);
  });
});

test('JSON workflow repository persists reusable composer resources', async () => {
  await withRepository(async (repository) => {
    const template = await repository.createCaptionTemplate({ name: 'Promo', caption: 'Hello', createdAt: '2026-09-14T13:00:00.000Z', updatedAt: '2026-09-14T13:00:00.000Z' });
    const hashtags = await repository.createHashtagCollection({ name: 'Pet', tags: ['#pet', '#cat'], createdAt: '2026-09-14T13:00:00.000Z', updatedAt: '2026-09-14T13:00:00.000Z' });
    const group = await repository.createDestinationGroup({ name: 'All', destinations: [{ platform: 'facebook', accountId: 'a1' }], createdAt: '2026-09-14T13:00:00.000Z', updatedAt: '2026-09-14T13:00:00.000Z' });

    assert.equal((await repository.listCaptionTemplates())[0].id, template.id);
    assert.deepEqual((await repository.listHashtagCollections())[0].tags, ['#pet', '#cat']);
    assert.equal((await repository.listDestinationGroups())[0].id, group.id);
    assert.equal(await repository.deleteCaptionTemplate(template.id), true);
    assert.equal(await repository.deleteHashtagCollection(hashtags.id), true);
    assert.equal(await repository.deleteDestinationGroup(group.id), true);
  });
});