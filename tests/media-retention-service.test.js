import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupOrphanMedia } from '../server/services/media-retention-service.js';

function harness({ records = [], assets = [], removeErrorFor = null } = {}) {
  const removed = [];
  const repository = { async listMedia() { return records.map((record) => ({ ...record })); } };
  const mediaStore = {
    async list() { return assets.map((asset) => ({ ...asset })); },
    keyFromUrl(url) {
      try {
        const pathname = new URL(url).pathname;
        return pathname.split('/').at(-1) || null;
      } catch { return null; }
    },
    async remove(key) {
      if (key === removeErrorFor) throw Object.assign(new Error('provider secret body'), { code: 'MEDIA_STORAGE_UNAVAILABLE' });
      removed.push(key);
    }
  };
  return { repository, mediaStore, removed };
}

test('deletes only unreferenced assets older than the retention cutoff', async () => {
  const h = harness({
    records: [{ url: 'https://cdn.example/media/referenced.jpg' }],
    assets: [
      { key: 'referenced.jpg', modifiedAt: '2026-07-01T00:00:00.000Z' },
      { key: 'old-orphan.jpg', modifiedAt: '2026-07-02T00:00:00.000Z' },
      { key: 'young-orphan.jpg', modifiedAt: '2026-09-10T00:00:00.000Z' }
    ]
  });
  const result = await cleanupOrphanMedia({
    ...h,
    now: new Date('2026-09-11T00:00:00.000Z'),
    retentionMs: 30 * 24 * 60 * 60 * 1000,
    maxDeletes: 100
  });
  assert.deepEqual(h.removed, ['old-orphan.jpg']);
  assert.deepEqual(result, { scanned: 3, eligible: 1, deleted: 1 });
});

test('deletes oldest eligible assets first and respects the batch limit', async () => {
  const h = harness({ assets: [
    { key: 'newer.jpg', modifiedAt: '2026-07-03T00:00:00.000Z' },
    { key: 'oldest.jpg', modifiedAt: '2026-07-01T00:00:00.000Z' },
    { key: 'middle.jpg', modifiedAt: '2026-07-02T00:00:00.000Z' }
  ] });
  const result = await cleanupOrphanMedia({
    ...h,
    now: new Date('2026-09-11T00:00:00.000Z'), retentionMs: 1, maxDeletes: 2
  });
  assert.deepEqual(h.removed, ['oldest.jpg', 'middle.jpg']);
  assert.deepEqual(result, { scanned: 3, eligible: 3, deleted: 2 });
});

test('ignores assets with missing or invalid modification timestamps instead of deleting them', async () => {
  const h = harness({ assets: [
    { key: 'missing.jpg' },
    { key: 'invalid.jpg', modifiedAt: 'not-a-date' }
  ] });
  const result = await cleanupOrphanMedia({ ...h, now: new Date('2026-09-11T00:00:00Z'), retentionMs: 1, maxDeletes: 10 });
  assert.deepEqual(h.removed, []);
  assert.deepEqual(result, { scanned: 2, eligible: 0, deleted: 0 });
});

test('sanitizes deletion failures without leaking object-store error text', async () => {
  const h = harness({
    assets: [{ key: 'old.jpg', modifiedAt: '2026-01-01T00:00:00Z' }],
    removeErrorFor: 'old.jpg'
  });
  await assert.rejects(
    () => cleanupOrphanMedia({ ...h, now: new Date('2026-09-11T00:00:00Z'), retentionMs: 1, maxDeletes: 10 }),
    (error) => error?.code === 'MEDIA_RETENTION_CLEANUP_FAILED' && !String(error.message).includes('provider secret')
  );
});

test('rejects invalid retention configuration before scanning storage', async () => {
  const h = harness();
  await assert.rejects(() => cleanupOrphanMedia({ ...h, retentionMs: 0, maxDeletes: 10 }), /MEDIA_RETENTION_CONFIG_INVALID/);
  await assert.rejects(() => cleanupOrphanMedia({ ...h, retentionMs: 1000, maxDeletes: 0 }), /MEDIA_RETENTION_CONFIG_INVALID/);
});
