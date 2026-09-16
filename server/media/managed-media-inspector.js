import { parseImageDimensions, parseMp4Duration } from './media-metadata.js';

function validSize(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

async function collectStream(stream, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk ?? []);
    total += bytes.length;
    if (Number.isSafeInteger(maxBytes) && maxBytes >= 0 && total > maxBytes) return null;
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

export function createManagedMediaInspector({ mediaStore } = {}) {
  if (!mediaStore || typeof mediaStore.keyFromUrl !== 'function' || typeof mediaStore.open !== 'function') {
    throw new Error('MANAGED_MEDIA_STORE_REQUIRED');
  }

  return {
    async inspect(media, { maxBytes } = {}) {
      const key = mediaStore.keyFromUrl(media?.url);
      if (!key) return null;

      let opened;
      try {
        opened = await mediaStore.open(key);
      } catch {
        return null;
      }

      const base = {
        contentType: String(opened?.contentType ?? ''),
        sizeBytes: opened?.size
      };
      const stream = opened?.stream;
      try {
        if (!validSize(base.sizeBytes) || !stream || typeof stream[Symbol.asyncIterator] !== 'function') return null;
        if (Number.isSafeInteger(maxBytes) && maxBytes >= 0 && base.sizeBytes > maxBytes) return base;

        const type = String(media?.type ?? '').trim().toLowerCase();
        if (type === 'image') {
          const bytes = await collectStream(stream, maxBytes);
          if (!bytes) return base;
          const dimensions = parseImageDimensions(base.contentType, bytes);
          return dimensions ? { ...base, ...dimensions } : base;
        }

        if (type === 'video' && base.contentType.toLowerCase() === 'video/mp4') {
          const durationSeconds = await parseMp4Duration(stream);
          return durationSeconds === null ? base : { ...base, durationSeconds };
        }

        return base;
      } catch {
        return base;
      } finally {
        if (stream && typeof stream.destroy === 'function' && !stream.destroyed) stream.destroy();
      }
    }
  };
}
