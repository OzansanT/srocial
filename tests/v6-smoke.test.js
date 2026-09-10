import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createJsonRepository } from '../server/db/json-repository.js';
import { createScheduledPost } from '../server/services/post-service.js';
import { runSchedulerTick } from '../server/scheduler/run-scheduler-tick.js';

test('account-bound post with media executes once through scheduler', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'srocial-v6-smoke-'));
  try {
    const repository = createJsonRepository({ filePath: join(dir, 'data.json') });
    await repository.initialize();
    const account = await repository.createAccount({ provider: 'instagram', providerAccountId: 'ig-provider-1', state: 'CONNECTED' });
    const result = await createScheduledPost(repository, {
      caption: 'End to end',
      destinations: [{ platform: 'instagram', accountId: account.id }],
      media: [{ type: 'image', url: 'https://cdn.example.com/end-to-end.jpg' }],
      scheduledAt: '2026-09-10T12:01:00.000Z'
    }, { now: new Date('2026-09-10T12:00:00.000Z') });

    let calls = 0;
    const registry = new Map([['instagram', {
      async publish({ post, publication }) {
        calls += 1;
        assert.equal(publication.accountId, account.id);
        assert.equal(post.id, result.post.id);
        const media = await repository.listMediaForPost(post.id);
        assert.equal(media.length, 1);
        assert.equal(media[0].url, 'https://cdn.example.com/end-to-end.jpg');
        return { status: 'PUBLISHED', externalId: 'ig-post-1' };
      }
    }]]);
    const tickAt = new Date('2026-09-10T12:02:00.000Z');
    const first = await runSchedulerTick({ repository, registry, now: tickAt, workerId: 'v6-smoke' });
    const second = await runSchedulerTick({ repository, registry, now: tickAt, workerId: 'v6-smoke' });
    assert.equal(first.claimed, 1);
    assert.equal(first.completed, 1);
    assert.equal(second.claimed, 0);
    assert.equal(calls, 1);
    assert.equal((await repository.getPublication(result.publications[0].id)).state, 'PUBLISHED');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
