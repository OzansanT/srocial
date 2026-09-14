import test from 'node:test';
import assert from 'node:assert/strict';
import { executeSocialPublicationJob } from '../server/scheduler/workers/social-publication-worker.js';

function repositoryFixture() {
  const attempts=[];
  const providerStatuses=[];
  const publication={ id:'pub-1', postId:'post-1', platform:'instagram', state:'SCHEDULED', externalId:null, externalUrl:null };
  const job={ id:'job-1', type:'SOCIAL_PUBLICATION', publicationId:'pub-1', attempts:1, state:'RUNNING' };
  return {
    job, publication, attempts, providerStatuses,
    async getPublication() { return structuredClone(publication); },
    async getPost() { return { id:'post-1', caption:'hello' }; },
    async updatePublication(id, patch) { Object.assign(publication, structuredClone(patch)); return structuredClone(publication); },
    async updateJob() { return null; },
    async createJob() { return null; },
    async createPublicationAttempt(record) { const item={ id:`attempt-${attempts.length+1}`, ...structuredClone(record) }; attempts.push(item); return structuredClone(item); },
    async updatePublicationAttempt(id, patch) { const item=attempts.find((candidate)=>candidate.id===id); Object.assign(item, structuredClone(patch)); return structuredClone(item); },
    async upsertProviderStatus(provider, patch) {
      let item=providerStatuses.find((candidate)=>candidate.provider===provider);
      if (!item) { item={ provider }; providerStatuses.push(item); }
      Object.assign(item, structuredClone(patch));
      return structuredClone(item);
    }
  };
}

test('successful publication records attempt completion and healthy provider state', async () => {
  const repository=repositoryFixture();
  const result=await executeSocialPublicationJob({
    job:repository.job,
    repository,
    registry:new Map([['instagram',{ publish:async()=>({ status:'PUBLISHED', externalId:'ig-1' }) }]]),
    now:new Date('2026-09-14T12:00:00.000Z')
  });
  assert.equal(result.status, 'COMPLETED');
  assert.equal(repository.attempts.length, 1);
  assert.equal(repository.attempts[0].state, 'PUBLISHED');
  assert.equal(repository.attempts[0].finishedAt, '2026-09-14T12:00:00.000Z');
  assert.equal(repository.providerStatuses[0].healthState, 'HEALTHY');
  assert.equal(repository.providerStatuses[0].lastErrorCode, null);
});

test('rate-limited publication records retry attempt and visible limited-until state', async () => {
  const repository=repositoryFixture();
  const error=Object.assign(new Error('limited'), { code:'RATE_LIMIT', retryable:true });
  const result=await executeSocialPublicationJob({
    job:{ ...repository.job, attempts:2 },
    repository,
    registry:new Map([['instagram',{ publish:async()=>{ throw error; } }]]),
    now:new Date('2026-09-14T12:00:00.000Z'),
    retryPolicy:{ classifyExecutionError:()=>({ code:'RATE_LIMIT', retryable:true }), getRetryDelayMs:()=>300000 }
  });
  assert.equal(result.status, 'RETRYING');
  assert.equal(repository.attempts[0].state, 'RETRYING');
  assert.equal(repository.attempts[0].providerErrorCode, 'RATE_LIMIT');
  assert.equal(repository.providerStatuses[0].healthState, 'DEGRADED');
  assert.equal(repository.providerStatuses[0].lastErrorCode, 'RATE_LIMIT');
  assert.equal(repository.providerStatuses[0].limitedUntil, '2026-09-14T12:05:00.000Z');
});