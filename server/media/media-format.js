const GENERATED_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|mp4)$/i;
const MAX_SIGNATURE_BYTES = 12;

const MEDIA_FORMATS = Object.freeze({
  'image/jpeg': Object.freeze({ contentType: 'image/jpeg', extension: '.jpg', type: 'image', signatureBytes: 3 }),
  'image/png': Object.freeze({ contentType: 'image/png', extension: '.png', type: 'image', signatureBytes: 8 }),
  'image/webp': Object.freeze({ contentType: 'image/webp', extension: '.webp', type: 'image', signatureBytes: 12 }),
  'video/mp4': Object.freeze({ contentType: 'video/mp4', extension: '.mp4', type: 'video', signatureBytes: 8 })
});

const EXTENSIONS = Object.freeze({
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4'
});

export class MediaStoreError extends Error {
  constructor(code) {
    super(code);
    this.name = 'MediaStoreError';
    this.code = code;
  }
}

export function normalizeMediaContentType(contentType) {
  return String(contentType ?? '').split(';', 1)[0].trim().toLowerCase();
}

export function getMediaFormat(contentType) {
  const normalized = normalizeMediaContentType(contentType);
  const format = Object.hasOwn(MEDIA_FORMATS, normalized) ? MEDIA_FORMATS[normalized] : null;
  if (!format) throw new MediaStoreError('UNSUPPORTED_MEDIA_TYPE');
  return { ...format };
}

export function mediaMetadataFromKey(key) {
  const match = String(key ?? '').match(GENERATED_KEY);
  if (!match) return null;
  const contentType = EXTENSIONS[match[1].toLowerCase()];
  const format = contentType ? MEDIA_FORMATS[contentType] : null;
  return format ? { contentType: format.contentType, type: format.type } : null;
}

function startsWithBytes(buffer, values) {
  if (buffer.length < values.length) return false;
  for (let index = 0; index < values.length; index += 1) {
    if (buffer[index] !== values[index]) return false;
  }
  return true;
}

function detectedContentType(prefix) {
  if (startsWithBytes(prefix, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWithBytes(prefix, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (prefix.length >= 12 && prefix.subarray(0, 4).toString('ascii') === 'RIFF' && prefix.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (prefix.length >= 8 && prefix.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
  return null;
}

function validatePrefix(prefix, declaredType) {
  const actualType = detectedContentType(prefix);
  if (actualType === declaredType) return;
  if (actualType) throw new MediaStoreError('MEDIA_SIGNATURE_MISMATCH');
  throw new MediaStoreError('INVALID_MEDIA_SIGNATURE');
}

export function createValidatedMediaIterable(readable, { contentType } = {}) {
  const format = getMediaFormat(contentType);
  if (!readable || typeof readable[Symbol.asyncIterator] !== 'function') {
    throw new MediaStoreError('EMPTY_MEDIA');
  }

  async function* iterator() {
    let prefix = Buffer.alloc(0);
    let validated = false;
    let sawBytes = false;

    for await (const chunk of readable) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (bytes.length === 0) continue;
      sawBytes = true;

      if (validated) {
        yield bytes;
        continue;
      }

      const needed = Math.max(0, MAX_SIGNATURE_BYTES - prefix.length);
      const prefixPart = bytes.subarray(0, needed);
      const remainder = bytes.subarray(prefixPart.length);
      if (prefixPart.length) prefix = Buffer.concat([prefix, prefixPart]);

      if (prefix.length >= MAX_SIGNATURE_BYTES) {
        validatePrefix(prefix, format.contentType);
        validated = true;
        yield prefix;
        if (remainder.length) yield remainder;
      }
    }

    if (!sawBytes) throw new MediaStoreError('EMPTY_MEDIA');
    if (!validated) {
      validatePrefix(prefix, format.contentType);
      yield prefix;
    }
  }

  return { format, iterable: iterator() };
}
