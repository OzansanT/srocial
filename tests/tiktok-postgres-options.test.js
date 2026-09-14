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
const schema = 'test_tiktok_v15_options';
let pool;
let repository;

before(async () => {
  if (!enabled) return;
  pool = await preparePostgresTestSchema(schema);
  repository = createPostgresRepository({ pool });
});
beforeEach(async () => { if (enabled) await clearPostgresRuntimeTables(pool); });
after(async () => { if (enabled) { await pool.end(); await dropPostgresTestSchema(schema); } });

test('PostgreSQL round-trips provider-specific publication options', { skip: !enabled }, async () => {
  const timestamp='2026-09-14T10:00:00.000Z';
  const post=await repository.createPost({ caption:'TikTok', scheduledAt:'2026-09-15T10:00:00.000Z', createdAt:timestamp, updatedAt:timestamp });
  const providerOptions={
    privacyLevel:'SELF_ONLY', allowComment:false, allowDuet:false, allowStitch:false,
    commercialContent:false, brandOrganic:false, brandContent:false, isAigc:false, consent:true
  };
  const publication=await repository.createPublication({
    postId:post.id, accountId:null, platform:'tiktok', state:'SCHEDULED',
    scheduledAt:'2026-09-15T10:00:00.000Z', providerOptions,
    externalId:null, externalUrl:null, errorCode:null, createdAt:timestamp, updatedAt:timestamp
  });
  assert.deepEqual(publication.providerOptions, providerOptions);
  assert.deepEqual((await repository.getPublication(publication.id)).providerOptions, providerOptions);
});
