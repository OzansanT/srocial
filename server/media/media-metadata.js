const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function positiveDimensions(width, height) {
  return Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0
    ? { width, height }
    : null;
}

function parsePng(bytes) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
  return positiveDimensions(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
}

function parseJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > bytes.length) return null;

    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) return null;
      return positiveDimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
    }
    offset += segmentLength;
  }
  return null;
}

function parseWebp(bytes) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    return null;
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const payloadOffset = offset + 8;
    const payloadEnd = payloadOffset + chunkSize;
    if (payloadEnd > bytes.length) return null;

    if (type === 'VP8X' && chunkSize >= 10) {
      return positiveDimensions(
        bytes.readUIntLE(payloadOffset + 4, 3) + 1,
        bytes.readUIntLE(payloadOffset + 7, 3) + 1
      );
    }

    if (type === 'VP8L' && chunkSize >= 5 && bytes[payloadOffset] === 0x2f) {
      const packed = bytes.readUInt32LE(payloadOffset + 1);
      return positiveDimensions((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
    }

    if (
      type === 'VP8 ' && chunkSize >= 10 &&
      bytes[payloadOffset + 3] === 0x9d && bytes[payloadOffset + 4] === 0x01 && bytes[payloadOffset + 5] === 0x2a
    ) {
      return positiveDimensions(
        bytes.readUInt16LE(payloadOffset + 6) & 0x3fff,
        bytes.readUInt16LE(payloadOffset + 8) & 0x3fff
      );
    }

    offset = payloadEnd + (chunkSize % 2);
  }
  return null;
}

export function parseImageDimensions(contentType, input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input ?? []);
  const normalized = String(contentType ?? '').trim().toLowerCase();
  if (normalized === 'image/png') return parsePng(bytes);
  if (normalized === 'image/jpeg') return parseJpeg(bytes);
  if (normalized === 'image/webp') return parseWebp(bytes);
  return null;
}

class AsyncByteReader {
  constructor(source) {
    this.iterator = source[Symbol.asyncIterator]();
    this.current = Buffer.alloc(0);
    this.offset = 0;
    this.ended = false;
  }

  async nextChunk() {
    if (this.ended) return false;
    const next = await this.iterator.next();
    if (next.done) {
      this.ended = true;
      this.current = Buffer.alloc(0);
      this.offset = 0;
      return false;
    }
    this.current = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value ?? []);
    this.offset = 0;
    if (this.current.length === 0) return this.nextChunk();
    return true;
  }

  async readExact(length) {
    if (!Number.isSafeInteger(length) || length < 0) return null;
    if (length === 0) return Buffer.alloc(0);
    const pieces = [];
    let remaining = length;
    while (remaining > 0) {
      if (this.offset >= this.current.length && !(await this.nextChunk())) return null;
      const available = this.current.length - this.offset;
      const take = Math.min(available, remaining);
      pieces.push(this.current.subarray(this.offset, this.offset + take));
      this.offset += take;
      remaining -= take;
    }
    return pieces.length === 1 ? pieces[0] : Buffer.concat(pieces, length);
  }

  async skip(length) {
    if (!Number.isSafeInteger(length) || length < 0) return false;
    let remaining = length;
    while (remaining > 0) {
      if (this.offset >= this.current.length && !(await this.nextChunk())) return false;
      const available = this.current.length - this.offset;
      const take = Math.min(available, remaining);
      this.offset += take;
      remaining -= take;
    }
    return true;
  }
}

async function* oneBuffer(bytes) {
  yield bytes;
}

function asAsyncSource(input) {
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) return oneBuffer(Buffer.from(input));
  if (input && typeof input[Symbol.asyncIterator] === 'function') return input;
  return null;
}

async function readBoxHeader(reader, enclosingRemaining = null) {
  const base = await reader.readExact(8);
  if (!base) return null;
  const size32 = base.readUInt32BE(0);
  const type = base.toString('ascii', 4, 8);
  let headerSize = 8;
  let size;

  if (size32 === 1) {
    const extended = await reader.readExact(8);
    if (!extended) return null;
    const extendedSize = extended.readBigUInt64BE(0);
    if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    size = Number(extendedSize);
    headerSize = 16;
  } else if (size32 === 0) {
    if (!Number.isSafeInteger(enclosingRemaining)) return null;
    size = enclosingRemaining;
  } else {
    size = size32;
  }

  if (!Number.isSafeInteger(size) || size < headerSize) return null;
  if (Number.isSafeInteger(enclosingRemaining) && size > enclosingRemaining) return null;
  return { type, size, headerSize, payloadSize: size - headerSize };
}

async function parseMvhd(reader, payloadSize) {
  if (payloadSize < 20) {
    await reader.skip(payloadSize);
    return null;
  }
  const first = await reader.readExact(4);
  if (!first) return null;
  const version = first[0];
  let consumed = 4;
  let timescale;
  let duration;

  if (version === 0) {
    const fields = await reader.readExact(16);
    if (!fields) return null;
    consumed += 16;
    timescale = fields.readUInt32BE(8);
    duration = fields.readUInt32BE(12);
  } else if (version === 1) {
    if (payloadSize < 32) {
      await reader.skip(payloadSize - consumed);
      return null;
    }
    const fields = await reader.readExact(28);
    if (!fields) return null;
    consumed += 28;
    timescale = fields.readUInt32BE(16);
    duration = Number(fields.readBigUInt64BE(20));
  } else {
    await reader.skip(payloadSize - consumed);
    return null;
  }

  if (payloadSize > consumed) await reader.skip(payloadSize - consumed);
  if (!timescale || !Number.isFinite(duration)) return null;
  const seconds = duration / timescale;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

async function parseMoov(reader, payloadSize) {
  let remaining = payloadSize;
  while (remaining >= 8) {
    const header = await readBoxHeader(reader, remaining);
    if (!header) return null;
    remaining -= header.size;
    if (header.type === 'mvhd') {
      const duration = await parseMvhd(reader, header.payloadSize);
      if (duration !== null) return duration;
    } else if (!(await reader.skip(header.payloadSize))) {
      return null;
    }
  }
  if (remaining > 0) await reader.skip(remaining);
  return null;
}

export async function parseMp4Duration(input) {
  const source = asAsyncSource(input);
  if (!source) return null;
  try {
    const reader = new AsyncByteReader(source);
    while (true) {
      const header = await readBoxHeader(reader);
      if (!header) return null;
      if (header.type === 'moov') return await parseMoov(reader, header.payloadSize);
      if (!(await reader.skip(header.payloadSize))) return null;
    }
  } catch {
    return null;
  }
}
