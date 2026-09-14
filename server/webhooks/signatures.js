import { createHmac, timingSafeEqual } from 'node:crypto';

function safeEqualHex(actual, expected) {
  const left = Buffer.from(String(actual ?? '').toLowerCase(), 'utf8');
  const right = Buffer.from(String(expected ?? '').toLowerCase(), 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyMetaSignature({ rawBody, signature, secret } = {}) {
  const key = String(secret ?? '');
  const match = /^sha256=([a-f0-9]{64})$/i.exec(String(signature ?? '').trim());
  if (!key || !match || !Buffer.isBuffer(rawBody)) return false;
  const expected = createHmac('sha256', key).update(rawBody).digest('hex');
  return safeEqualHex(match[1], expected);
}

function parseTikTokSignature(value) {
  const parts = {};
  for (const segment of String(value ?? '').split(',')) {
    const index = segment.indexOf('=');
    if (index <= 0) continue;
    parts[segment.slice(0, index).trim()] = segment.slice(index + 1).trim();
  }
  return parts;
}

export function verifyTikTokSignature({ rawBody, signature, secret, now = new Date(), maxAgeSeconds = 300 } = {}) {
  const key = String(secret ?? '');
  if (!key || !Buffer.isBuffer(rawBody)) return false;
  const parts = parseTikTokSignature(signature);
  if (!/^\d+$/.test(parts.t ?? '') || !/^[a-f0-9]{64}$/i.test(parts.s ?? '')) return false;
  const timestamp = Number(parts.t);
  const nowSeconds = Math.floor((now instanceof Date ? now : new Date(now)).getTime() / 1000);
  const age = Math.abs(nowSeconds - timestamp);
  if (!Number.isFinite(nowSeconds) || !Number.isFinite(timestamp) || age > Number(maxAgeSeconds)) return false;
  const message = `${parts.t}.${rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', key).update(message).digest('hex');
  return safeEqualHex(parts.s, expected);
}
