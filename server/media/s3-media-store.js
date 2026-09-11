import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { createValidatedMediaIterable, mediaMetadataFromKey, MediaStoreError } from './media-format.js';

const EMPTY_SHA256 = createHash('sha256').update('').digest('hex');
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_TOTAL_MAX_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_LIST_PAGES = 10000;

function positiveBytes(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeEndpoint(value) {
  const url = new URL(String(value ?? '').trim());
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('MEDIA_S3_ENDPOINT_INVALID');
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

function normalizePublicBaseUrl(value) {
  const url = new URL(String(value ?? '').trim());
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('MEDIA_PUBLIC_BASE_URL_INVALID');
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

function normalizeBucket(value) {
  const bucket = String(value ?? '').trim();
  if (!bucket || bucket.includes('/') || bucket.includes('\\')) throw new Error('MEDIA_S3_BUCKET_REQUIRED');
  return bucket;
}

function normalizePrefix(value) {
  const prefix = String(value ?? '').trim().replace(/^\/+|\/+$/g, '');
  return prefix ? `${prefix}/` : '';
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodedObjectPath(key) {
  return String(key).split('/').map(encodePathSegment).join('/');
}

function pathJoin(basePath, ...parts) {
  const head = String(basePath || '').replace(/\/+$/, '');
  return `${head}/${parts.map((part) => String(part).replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}` || '/';
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function xmlText(block, tag) {
  const match = String(block).match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : null;
}

function parseListObjectsXml(xml) {
  const contents = [];
  const pattern = /<Contents>([\s\S]*?)<\/Contents>/gi;
  for (const match of String(xml).matchAll(pattern)) {
    const key = xmlText(match[1], 'Key');
    const size = Number.parseInt(xmlText(match[1], 'Size') ?? '', 10);
    const modifiedAt = xmlText(match[1], 'LastModified');
    if (!key || !Number.isSafeInteger(size) || size < 0 || !modifiedAt || Number.isNaN(Date.parse(modifiedAt))) continue;
    contents.push({ key, size, modifiedAt: new Date(modifiedAt).toISOString() });
  }
  return {
    contents,
    truncated: String(xmlText(xml, 'IsTruncated')).toLowerCase() === 'true',
    nextToken: xmlText(xml, 'NextContinuationToken')
  };
}

function publicUrl(baseUrl, key) {
  return `${baseUrl.toString().replace(/\/$/, '')}/${encodeURIComponent(key)}`;
}

async function collectValidated(readable, contentType, maxBytes) {
  const { format, iterable } = createValidatedMediaIterable(readable, { contentType });
  const chunks = [];
  let size = 0;
  for await (const chunk of iterable) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) throw new MediaStoreError('MEDIA_TOO_LARGE');
    chunks.push(bytes);
  }
  return { format, bytes: Buffer.concat(chunks, size), size };
}

export function createS3MediaStore({ endpoint, bucket, prefix = '', publicBaseUrl, maxBytes = DEFAULT_MAX_BYTES, totalMaxBytes = DEFAULT_TOTAL_MAX_BYTES, requestClient } = {}) {
  const endpointUrl = normalizeEndpoint(endpoint);
  const publicBase = normalizePublicBaseUrl(publicBaseUrl);
  const bucketName = normalizeBucket(bucket);
  const objectPrefix = normalizePrefix(prefix);
  const byteLimit = positiveBytes(maxBytes, DEFAULT_MAX_BYTES);
  const totalByteLimit = positiveBytes(totalMaxBytes, DEFAULT_TOTAL_MAX_BYTES);
  if (!requestClient || typeof requestClient.request !== 'function') throw new Error('MEDIA_S3_REQUEST_CLIENT_REQUIRED');

  function bucketUrl() {
    const url = new URL(endpointUrl.toString());
    url.pathname = pathJoin(endpointUrl.pathname, encodePathSegment(bucketName));
    return url;
  }

  function objectUrl(key) {
    const url = bucketUrl();
    url.pathname = pathJoin(url.pathname, encodedObjectPath(`${objectPrefix}${key}`));
    return url;
  }

  async function listAssets() {
    const assets = [];
    let continuationToken = null;
    let page = 0;

    do {
      page += 1;
      if (page > MAX_LIST_PAGES) throw new MediaStoreError('MEDIA_STORAGE_ERROR');
      const url = bucketUrl();
      url.searchParams.set('list-type', '2');
      if (objectPrefix) url.searchParams.set('prefix', objectPrefix);
      if (continuationToken) url.searchParams.set('continuation-token', continuationToken);
      const response = await requestClient.request({ method: 'GET', url, payloadHash: EMPTY_SHA256 });
      const parsed = parseListObjectsXml(await response.text());

      for (const item of parsed.contents) {
        if (!item.key.startsWith(objectPrefix)) continue;
        const key = item.key.slice(objectPrefix.length);
        const metadata = mediaMetadataFromKey(key);
        if (!metadata) continue;
        assets.push({
          key,
          type: metadata.type,
          contentType: metadata.contentType,
          size: item.size,
          url: publicUrl(publicBase, key),
          isHttps: publicBase.protocol === 'https:',
          modifiedAt: item.modifiedAt
        });
      }

      if (!parsed.truncated) break;
      if (!parsed.nextToken || parsed.nextToken === continuationToken) throw new MediaStoreError('MEDIA_STORAGE_ERROR');
      continuationToken = parsed.nextToken;
    } while (true);

    assets.sort((left, right) => Date.parse(right.modifiedAt) - Date.parse(left.modifiedAt) || left.key.localeCompare(right.key));
    return assets;
  }

  async function storageUsage() {
    const assets = await listAssets();
    const usedBytes = assets.reduce((sum, asset) => sum + asset.size, 0);
    return {
      usedBytes,
      maxBytes: totalByteLimit,
      remainingBytes: Math.max(0, totalByteLimit - usedBytes),
      count: assets.length
    };
  }

  return {
    async initialize() {},

    async save(readable, { contentType } = {}) {
      const { format, bytes, size } = await collectValidated(readable, contentType, byteLimit);
      const usage = await storageUsage();
      if (usage.usedBytes + size > totalByteLimit) throw new MediaStoreError('MEDIA_STORAGE_QUOTA_EXCEEDED');

      const key = `${randomUUID()}${format.extension}`;
      const payloadHash = createHash('sha256').update(bytes).digest('hex');
      await requestClient.request({
        method: 'PUT',
        url: objectUrl(key),
        headers: {
          'content-type': format.contentType,
          'content-length': String(size)
        },
        body: bytes,
        payloadHash
      });
      return {
        key,
        type: format.type,
        contentType: format.contentType,
        size,
        url: publicUrl(publicBase, key),
        isHttps: publicBase.protocol === 'https:'
      };
    },

    list() {
      return listAssets();
    },

    usage() {
      return storageUsage();
    },

    keyFromUrl(value) {
      try {
        const url = new URL(String(value ?? ''));
        const basePath = publicBase.pathname.replace(/\/+$/, '');
        const expectedPrefix = `${basePath}/`;
        if (!url.pathname.startsWith(expectedPrefix)) return null;
        const remainder = url.pathname.slice(expectedPrefix.length);
        if (!remainder || remainder.includes('/')) return null;
        const key = decodeURIComponent(remainder);
        return mediaMetadataFromKey(key) ? key : null;
      } catch {
        return null;
      }
    },

    async open(key) {
      const value = String(key ?? '');
      const metadata = mediaMetadataFromKey(value);
      if (!metadata) throw new MediaStoreError('MEDIA_NOT_FOUND');
      const response = await requestClient.request({ method: 'GET', url: objectUrl(value), payloadHash: EMPTY_SHA256 });
      const size = Number.parseInt(response.headers.get('content-length') ?? '', 10);
      if (!Number.isSafeInteger(size) || size < 0 || !response.body) throw new MediaStoreError('MEDIA_STORAGE_ERROR');
      return {
        key: value,
        stream: Readable.fromWeb(response.body),
        contentType: metadata.contentType,
        size
      };
    },

    async remove(key) {
      const value = String(key ?? '');
      if (!mediaMetadataFromKey(value)) throw new MediaStoreError('MEDIA_NOT_FOUND');
      await requestClient.request({ method: 'DELETE', url: objectUrl(value), payloadHash: EMPTY_SHA256 });
    }
  };
}
