import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTrustedProxyAddresses, resolveClientAddress } from '../server/http/client-address.js';

function request(remoteAddress, forwardedFor = undefined) {
  return {
    socket: { remoteAddress },
    headers: forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor }
  };
}

test('untrusted peers cannot spoof rate-limit identity with X-Forwarded-For', () => {
  const trusted = parseTrustedProxyAddresses('10.0.0.10');
  assert.equal(resolveClientAddress(request('203.0.113.9', '198.51.100.7'), trusted), '203.0.113.9');
});

test('trusted direct proxy exposes the nearest untrusted forwarded client', () => {
  const trusted = parseTrustedProxyAddresses('10.0.0.10');
  assert.equal(resolveClientAddress(request('10.0.0.10', '198.51.100.7'), trusted), '198.51.100.7');
});

test('trusted multi-hop proxy chain walks right-to-left and ignores spoofed left entries', () => {
  const trusted = parseTrustedProxyAddresses('10.0.0.10, 10.0.0.11');
  assert.equal(
    resolveClientAddress(request('10.0.0.10', '192.0.2.44, 198.51.100.7, 10.0.0.11'), trusted),
    '198.51.100.7'
  );
});

test('invalid trusted proxy configuration fails closed at startup', () => {
  assert.throws(() => parseTrustedProxyAddresses('10.0.0.10, not-an-ip'), /TRUSTED_PROXY_IP_INVALID/);
});

test('malformed forwarded chain falls back to the direct trusted peer', () => {
  const trusted = parseTrustedProxyAddresses('10.0.0.10');
  assert.equal(resolveClientAddress(request('10.0.0.10', '198.51.100.7, nope'), trusted), '10.0.0.10');
});
