import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveAccountHealth } from '../server/services/account-health.js';

const now = new Date('2026-09-16T12:00:00.000Z');

function account(overrides = {}) {
  return {
    state: 'CONNECTED',
    tokenExpiresAt: null,
    lastErrorCode: null,
    ...overrides
  };
}

test('connected account inside refresh horizon exposes exact expiration warning', () => {
  assert.deepEqual(deriveAccountHealth(account({ tokenExpiresAt:'2026-09-24T12:00:00.000Z' }), { now }), {
    healthState:'EXPIRING',
    reconnectNeeded:false,
    reconnectReason:null,
    expiresInDays:8,
    expirationWarning:true
  });
});

test('connected account outside refresh horizon stays connected without warning', () => {
  assert.deepEqual(deriveAccountHealth(account({ tokenExpiresAt:'2026-10-17T12:00:00.000Z' }), { now }), {
    healthState:'CONNECTED',
    reconnectNeeded:false,
    reconnectReason:null,
    expiresInDays:31,
    expirationWarning:false
  });
});

test('past persisted expiry fails safe as reconnect-needed even before worker state catches up', () => {
  assert.deepEqual(deriveAccountHealth(account({ tokenExpiresAt:'2026-09-16T11:59:59.000Z' }), { now }), {
    healthState:'RECONNECT_NEEDED',
    reconnectNeeded:true,
    reconnectReason:'expired',
    expiresInDays:0,
    expirationWarning:false
  });
});

test('persisted account states expose distinct reconnect reasons', () => {
  assert.equal(deriveAccountHealth(account({ state:'DISCONNECTED' }), { now }).reconnectReason, 'disconnected');
  assert.equal(deriveAccountHealth(account({ state:'EXPIRED', lastErrorCode:'AUTH_ERROR' }), { now }).reconnectReason, 'expired');
  assert.equal(deriveAccountHealth(account({ state:'DISCONNECTED', lastErrorCode:'PERMISSION_REVOKED' }), { now }).reconnectReason, 'permission_revoked');
  assert.equal(deriveAccountHealth(account({ state:'ERROR', lastErrorCode:'PROVIDER_ERROR' }), { now }).reconnectReason, 'error');
});

test('connecting and non-expiring connected accounts remain non-reconnect states', () => {
  assert.deepEqual(deriveAccountHealth(account({ state:'CONNECTING' }), { now }), {
    healthState:'CONNECTING', reconnectNeeded:false, reconnectReason:null, expiresInDays:null, expirationWarning:false
  });
  assert.deepEqual(deriveAccountHealth(account(), { now }), {
    healthState:'CONNECTED', reconnectNeeded:false, reconnectReason:null, expiresInDays:null, expirationWarning:false
  });
});
