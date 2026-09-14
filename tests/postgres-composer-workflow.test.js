import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresRepository } from '../server/db/postgres-repository.js';
import {
  clearPostgresRuntimeTables,
  dropPostgresTestSchema,
  hasPostgresTestDatabase,
  preparePostgresTestSchema
} from './helpers/postgres-test-db.js';

const enabled = hasPostgresTestDatabase();
const schema = 'test_v19_composer_workflows';
let pool;
let repository;

before(async () => {
  if (!enabled) return;
  pool = await preparePostgresTestSchema(schema);
  repository = createPostgresRepository({ pool });
});

beforeEach(async () => {
  if (!enabled) return;
  await clearPostgresRuntimeTables(pool);
  await pool.query('TRUNCATE composer_drafts, caption_templates, hashtag_collections, destination_groups');
});

after(async () => {
  if (!enabled) return;
  await pool.end();
  await dropPostgresTestSchema(schema);
});

const timestamp = '2026-09-14T13:00:00.000Z';

test('PostgreSQL composer drafts use compare-and-swap revisions', { skip: !enabled }, async () => {
  const draft = await repository.createDraft({
    name: 'Launch', caption: 'Base', scheduledAt: null, media: [], destinations: [], platformOverrides: {},
    revision: 1, createdAt: timestamp, updatedAt: timestamp
  });
  const updated = await repository.updateDraft(draft.id, { caption: 'Saved', updatedAt: '2026-09-14T13:01:00.000Z' }, 1);
  assert.equal(updated.revision, 2);
  assert.equal(updated.caption, 'Saved');

  await assert.rejects(
    repository.updateDraft(draft.id, { caption: 'Stale' }, 1),
    (error) => error?.code === 'DRAFT_REVISION_CONFLICT'
  );
  assert.equal((await repository.getDraft(draft.id)).caption, 'Saved');
});

test('PostgreSQL reusable composer resources round-trip', { skip: !enabled }, async () => {
  const template = await repository.createCaptionTemplate({ name: 'Promo', caption: 'Hello', createdAt: timestamp, updatedAt: timestamp });
  const collection = await repository.createHashtagCollection({ name: 'Pets', tags: ['#pet'], createdAt: timestamp, updatedAt: timestamp });
  const group = await repository.createDestinationGroup({ name: 'Group', destinations: [], createdAt: timestamp, updatedAt: timestamp });

  assert.equal((await repository.listCaptionTemplates())[0].id, template.id);
  assert.deepEqual((await repository.listHashtagCollections())[0].tags, collection.tags);
  assert.equal((await repository.listDestinationGroups())[0].id, group.id);
});