import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountViewModel } from '../client/js/pages/accounts.js';

test('connected Instagram account supports reconnect and disconnect', () => {
  assert.deepEqual(buildAccountViewModel({
    id: 'acc-1',
    provider: 'instagram',
    username: 'demo',
    displayName: 'Demo Account',
    providerAccountId: 'ig-1',
    state: 'CONNECTED'
  }), {
    id: 'acc-1',
    provider: 'instagram',
    providerLabel: 'Instagram',
    identity: '@demo',
    displayName: 'Demo Account',
    state: 'CONNECTED',
    canReconnect: true,
    canDisconnect: true
  });
});

test('disconnected Instagram account supports reconnect but not disconnect', () => {
  const model = buildAccountViewModel({
    id: 'acc-2', provider: 'instagram', providerAccountId: 'ig-2', state: 'DISCONNECTED'
  });
  assert.equal(model.identity, 'ig-2');
  assert.equal(model.canReconnect, true);
  assert.equal(model.canDisconnect, false);
});

test('unsupported provider account never enables reconnect action', () => {
  const model = buildAccountViewModel({
    id: 'acc-3', provider: 'facebook', displayName: '<b>Unsafe</b>', state: 'CONNECTED'
  });
  assert.equal(model.providerLabel, 'Facebook');
  assert.equal(model.identity, '<b>Unsafe</b>');
  assert.equal(model.canReconnect, false);
  assert.equal(model.canDisconnect, true);
});
