import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createJsonRepository } from '../server/db/json-repository.js';

async function withTempFile(run) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-repo-'));
  const filePath = join(directory, 'data.json');
  try { await run(filePath); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('persists posts, publications and jobs across repository instances', async () => {
  await withTempFile(async (filePath) => {
    const first = createJsonRepository({ filePath });
    await first.initialize();
    const post = await first.createPost({ caption: 'Persist me', scheduledAt: '2026-09-11T10:00:00.000Z' });
    const publication = await first.createPublication({ postId: post.id, platform: 'instagram', state: 'SCHEDULED', scheduledAt: post.scheduledAt });
    await first.createJob({ type: 'SOCIAL_PUBLICATION', publicationId: publication.id, state: 'SCHEDULED', scheduledAt: post.scheduledAt, attempts: 0 });

    const second = createJsonRepository({ filePath });
    await second.initialize();
    const posts = await second.listPostsWithPublications();
    const jobs = await second.listJobs();

    assert.equal(posts.length, 1);
    assert.equal(posts[0].caption, 'Persist me');
    assert.equal(posts[0].publications.length, 1);
    assert.equal(posts[0].publications[0].platform, 'instagram');
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].publicationId, publication.id);
  });
});

test('writes valid JSON and returns defensive copies', async () => {
  await withTempFile(async (filePath) => {
    const repository = createJsonRepository({ filePath });
    await repository.initialize();
    const post = await repository.createPost({ caption: 'Original', scheduledAt: '2026-09-11T11:00:00.000Z' });
    post.caption = 'Mutated outside';
    const posts = await repository.listPostsWithPublications();
    assert.equal(posts[0].caption, 'Original');
    const disk = JSON.parse(await readFile(filePath, 'utf8'));
    assert.equal(disk.posts[0].caption, 'Original');
  });
});
