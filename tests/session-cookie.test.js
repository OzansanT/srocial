import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionCookieManager } from '../server/auth/session-cookie.js';

function cookiePair(setCookie) {
  return setCookie.split(';', 1)[0];
}

test('signed session cookie round-trips safe administrator identity', () => {
  const now = new Date('2026-09-11T00:00:00.000Z');
  const manager = createSessionCookieManager({ secret: 's'.repeat(40), ttlSeconds: 3600, secure: false, now: () => now });
  const setCookie = manager.issue('operator');
  const session = manager.read(cookiePair(setCookie));

  assert.deepEqual(session, { username: 'operator' });
  assert.match(setCookie, /^srocial_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Path=\//);
  assert.match(setCookie, /Max-Age=3600/);
  assert.doesNotMatch(setCookie, /Secure/);
});

test('HTTPS session cookies include Secure', () => {
  const manager = createSessionCookieManager({ secret: 's'.repeat(40), ttlSeconds: 60, secure: true, now: () => new Date('2026-09-11T00:00:00.000Z') });
  assert.match(manager.issue('admin'), /; Secure/);
});

test('tampered and malformed signed cookies fail closed', () => {
  const manager = createSessionCookieManager({ secret: 's'.repeat(40), ttlSeconds: 60, secure: false, now: () => new Date('2026-09-11T00:00:00.000Z') });
  const pair = cookiePair(manager.issue('admin'));
  const tampered = `${pair.slice(0, -1)}${pair.endsWith('a') ? 'b' : 'a'}`;

  assert.equal(manager.read(tampered), null);
  assert.equal(manager.read('srocial_session=invalid'), null);
  assert.equal(manager.read('other=value'), null);
  assert.equal(manager.read(''), null);
});

test('expired sessions fail closed', () => {
  let current = new Date('2026-09-11T00:00:00.000Z');
  const manager = createSessionCookieManager({ secret: 's'.repeat(40), ttlSeconds: 60, secure: false, now: () => current });
  const pair = cookiePair(manager.issue('admin'));
  current = new Date('2026-09-11T00:01:01.000Z');
  assert.equal(manager.read(pair), null);
});

test('clear returns an immediately expired session cookie', () => {
  const manager = createSessionCookieManager({ secret: 's'.repeat(40), ttlSeconds: 60, secure: true, now: () => new Date('2026-09-11T00:00:00.000Z') });
  const cleared = manager.clear();
  assert.match(cleared, /^srocial_session=/);
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /HttpOnly/);
  assert.match(cleared, /SameSite=Strict/);
  assert.match(cleared, /Secure/);
});
