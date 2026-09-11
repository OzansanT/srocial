import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonRepository } from '../server/db/json-repository.js';

test('listMedia returns all persisted post media records as clones', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-media-library-repo-'));
  try {
    const repository = createJsonRepository({ filePath: join(directory, 'data.json') });
    await repository.initialize();
    await repository.createMedia({ postId: 'p1', type: 'image', url: 'https://srocial.test/media/a.jpg', sortOrder: 0 });
    await repository.createMedia({ postId: 'p2', type: 'video', url: 'https://srocial.test/media/b.mp4', sortOrder: 0 });

    const media = await repository.listMedia();
    assert.equal(media.length, 2);
    media[0].url = 'mutated';
    assert.notEqual((await repository.listMedia())[0].url, 'mutated');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
