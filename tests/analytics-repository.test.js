import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonRepository } from '../server/db/json-repository.js';

async function withRepository(run) {
  const directory = await mkdtemp(join(tmpdir(), 'srocial-v20-analytics-'));
  const repository = createJsonRepository({ filePath: join(directory, 'data.json') });
  await repository.initialize();
  try { await run(repository); }
  finally { await repository.close(); await rm(directory, { recursive: true, force: true }); }
}

test('JSON analytics repository keeps append-only snapshots and returns latest by publication', async () => {
  await withRepository(async (repository) => {
    const first = await repository.createPublicationMetricSnapshot({
      publicationId: 'publication-1', accountId: 'account-1', provider: 'instagram', externalId: 'ig-1',
      views: 100, reach: 80, likes: 12, comments: 3, shares: 2, saves: 4,
      extraMetrics: {}, capturedAt: '2026-09-14T10:00:00.000Z'
    });
    const second = await repository.createPublicationMetricSnapshot({
      publicationId: 'publication-1', accountId: 'account-1', provider: 'instagram', externalId: 'ig-1',
      views: 140, reach: 110, likes: 20, comments: 5, shares: 3, saves: 6,
      extraMetrics: { totalInteractions: 34 }, capturedAt: '2026-09-14T11:00:00.000Z'
    });

    assert.notEqual(first.id, second.id);
    assert.equal((await repository.listPublicationMetricSnapshots()).length, 2);
    assert.equal((await repository.getLatestPublicationMetricSnapshot('publication-1')).id, second.id);
    assert.deepEqual((await repository.getLatestPublicationMetricSnapshot('publication-1')).extraMetrics, { totalInteractions: 34 });
  });
});

test('JSON analytics repository loads legacy state without analytics collection', async () => {
  await withRepository(async (repository) => {
    assert.deepEqual(await repository.listPublicationMetricSnapshots(), []);
  });
});