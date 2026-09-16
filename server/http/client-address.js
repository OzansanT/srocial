import { isIP } from 'node:net';

function normalizeIp(value) {
  let address = String(value ?? '').trim();
  if (!address) return null;
  if (address.startsWith('::ffff:')) {
    const mapped = address.slice(7);
    if (isIP(mapped) === 4) address = mapped;
  }
  return isIP(address) ? address.toLowerCase() : null;
}

export function parseTrustedProxyAddresses(value = '') {
  const trusted = new Set();
  const raw = String(value ?? '').trim();
  if (!raw) return trusted;
  for (const entry of raw.split(',')) {
    const address = normalizeIp(entry);
    if (!address) throw new Error('TRUSTED_PROXY_IP_INVALID');
    trusted.add(address);
  }
  return trusted;
}

export function resolveClientAddress(request, trustedProxyAddresses = new Set()) {
  const peer = normalizeIp(request?.socket?.remoteAddress) ?? 'unknown';
  const trusted = trustedProxyAddresses instanceof Set
    ? trustedProxyAddresses
    : new Set(trustedProxyAddresses ?? []);

  if (!trusted.has(peer)) return peer;

  const rawHeader = request?.headers?.['x-forwarded-for'];
  if (rawHeader === undefined || rawHeader === null || String(rawHeader).trim() === '') return peer;
  const entries = (Array.isArray(rawHeader) ? rawHeader.join(',') : String(rawHeader))
    .split(',')
    .map((entry) => normalizeIp(entry));
  if (entries.length === 0 || entries.some((entry) => entry === null)) return peer;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (!trusted.has(entries[index])) return entries[index];
  }
  return entries[0] ?? peer;
}
