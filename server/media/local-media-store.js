import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

const MEDIA_TYPES = Object.freeze({
  'image/jpeg': { extension: '.jpg', type: 'image' },
  'image/png': { extension: '.png', type: 'image' },
  'image/webp': { extension: '.webp', type: 'image' },
  'video/mp4': { extension: '.mp4', type: 'video' }
});

const EXTENSIONS = Object.freeze({
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4'
});

const GENERATED_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|mp4)$/i;
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

export class MediaStoreError extends Error {
  constructor(code) {
    super(code);
    this.name = 'MediaStoreError';
    this.code = code;
  }
}

function normalizeContentType(contentType) {
  return String(contentType ?? '').split(';', 1)[0].trim().toLowerCase();
}

function normalizeMaxBytes(value) {
  const parsed = Number.parseInt(String(value ?? DEFAULT_MAX_BYTES), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BYTES;
}

function normalizePublicBaseUrl(value) {
  const url = new URL(String(value ?? '').trim());
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

function publicMediaUrl(baseUrl, key) {
  const base = baseUrl.toString().replace(/\/$/, '');
  return `${base}/media/${encodeURIComponent(key)}`;
}

function notFound() {
  return new MediaStoreError('MEDIA_NOT_FOUND');
}

export function createLocalMediaStore({ rootDirectory, publicBaseUrl, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const root = String(rootDirectory ?? '').trim();
  if (!root) throw new Error('MEDIA_UPLOAD_DIRECTORY_REQUIRED');
  const baseUrl = normalizePublicBaseUrl(publicBaseUrl);
  const byteLimit = normalizeMaxBytes(maxBytes);

  return {
    async initialize() {
      await mkdir(root, { recursive: true });
    },

    async save(readable, { contentType } = {}) {
      const normalizedType = normalizeContentType(contentType);
      const media = Object.hasOwn(MEDIA_TYPES, normalizedType) ? MEDIA_TYPES[normalizedType] : null;
      if (!media) throw new MediaStoreError('UNSUPPORTED_MEDIA_TYPE');
      if (!readable || typeof readable[Symbol.asyncIterator] !== 'function') {
        throw new MediaStoreError('EMPTY_MEDIA');
      }

      const key = `${randomUUID()}${media.extension}`;
      const filePath = join(root, key);
      let fileHandle = null;
      let size = 0;
      let completed = false;

      try {
        fileHandle = await open(filePath, 'wx');
        for await (const chunk of readable) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          if (bytes.length === 0) continue;
          size += bytes.length;
          if (size > byteLimit) throw new MediaStoreError('MEDIA_TOO_LARGE');
          let offset = 0;
          while (offset < bytes.length) {
            const { bytesWritten } = await fileHandle.write(bytes, offset, bytes.length - offset);
            if (bytesWritten === 0) throw new MediaStoreError('MEDIA_STORAGE_ERROR');
            offset += bytesWritten;
          }
        }
        if (size === 0) throw new MediaStoreError('EMPTY_MEDIA');
        completed = true;
      } catch (error) {
        if (error instanceof MediaStoreError) throw error;
        throw new MediaStoreError('MEDIA_STORAGE_ERROR');
      } finally {
        if (fileHandle) {
          try { await fileHandle.close(); } catch { /* cleanup below */ }
        }
        if (!completed) {
          try { await rm(filePath, { force: true }); } catch { /* do not leak storage paths */ }
        }
      }

      return {
        key,
        type: media.type,
        contentType: normalizedType,
        size,
        url: publicMediaUrl(baseUrl, key),
        isHttps: baseUrl.protocol === 'https:'
      };
    },

    async open(key) {
      const value = String(key ?? '');
      const match = value.match(GENERATED_KEY);
      if (!match) throw notFound();
      const contentType = EXTENSIONS[match[1].toLowerCase()];
      if (!contentType) throw notFound();

      const filePath = join(root, value);
      let fileStat;
      try {
        fileStat = await stat(filePath);
      } catch (error) {
        if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') throw notFound();
        throw new MediaStoreError('MEDIA_STORAGE_ERROR');
      }
      if (!fileStat.isFile()) throw notFound();

      return {
        key: value,
        stream: createReadStream(filePath),
        contentType,
        size: fileStat.size
      };
    }
  };
}
