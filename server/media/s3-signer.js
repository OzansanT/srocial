import { createHash, createHmac } from 'node:crypto';

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest();
}

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalPath(pathname) {
  return String(pathname || '/')
    .split('/')
    .map((segment) => {
      try { return encodeRfc3986(decodeURIComponent(segment)); } catch { return encodeRfc3986(segment); }
    })
    .join('/') || '/';
}

function canonicalQuery(searchParams) {
  const pairs = [];
  for (const [name, value] of searchParams.entries()) {
    pairs.push([encodeRfc3986(name), encodeRfc3986(value)]);
  }
  pairs.sort(([nameA, valueA], [nameB, valueB]) => nameA.localeCompare(nameB) || valueA.localeCompare(valueB));
  return pairs.map(([name, value]) => `${name}=${value}`).join('&');
}

function normalizeHeaderValue(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function amzTimestamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('MEDIA_S3_SIGNING_DATE_INVALID');
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

export function signS3Request({ method, url, region, accessKeyId, secretAccessKey, headers = {}, payloadHash, now = new Date() } = {}) {
  const keyId = String(accessKeyId ?? '').trim();
  const secret = String(secretAccessKey ?? '');
  if (!keyId) throw new Error('MEDIA_S3_ACCESS_KEY_REQUIRED');
  if (!secret) throw new Error('MEDIA_S3_SECRET_KEY_REQUIRED');

  const target = url instanceof URL ? new URL(url.toString()) : new URL(String(url ?? ''));
  const serviceRegion = String(region ?? '').trim() || 'us-east-1';
  const timestamp = amzTimestamp(now);
  const dateStamp = timestamp.slice(0, 8);
  const normalizedPayloadHash = String(payloadHash ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalizedPayloadHash)) throw new Error('MEDIA_S3_PAYLOAD_HASH_INVALID');

  const canonicalHeaders = new Map();
  for (const [name, value] of Object.entries(headers)) {
    const normalizedName = String(name).trim().toLowerCase();
    if (!normalizedName || normalizedName === 'authorization') continue;
    canonicalHeaders.set(normalizedName, normalizeHeaderValue(value));
  }
  canonicalHeaders.set('host', target.host);
  canonicalHeaders.set('x-amz-content-sha256', normalizedPayloadHash);
  canonicalHeaders.set('x-amz-date', timestamp);

  const headerNames = [...canonicalHeaders.keys()].sort();
  const signedHeaders = headerNames.join(';');
  const canonicalHeaderBlock = `${headerNames.map((name) => `${name}:${canonicalHeaders.get(name)}`).join('\n')}\n`;
  const canonicalRequest = [
    String(method ?? 'GET').toUpperCase(),
    canonicalPath(target.pathname),
    canonicalQuery(target.searchParams),
    canonicalHeaderBlock,
    signedHeaders,
    normalizedPayloadHash
  ].join('\n');

  const credentialScope = `${dateStamp}/${serviceRegion}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join('\n');

  const dateKey = hmac(Buffer.from(`AWS4${secret}`, 'utf8'), dateStamp);
  const regionKey = hmac(dateKey, serviceRegion);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const result = Object.fromEntries(headerNames.map((name) => [name, canonicalHeaders.get(name)]));
  result.authorization = `AWS4-HMAC-SHA256 Credential=${keyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return result;
}
