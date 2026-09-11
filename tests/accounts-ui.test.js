import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountViewModel } from '../client/js/pages/accounts.js';

test('connected Instagram account supports reconnect and disconnect', () => {
  assert.deepEqual(buildAccountViewModel({
    id: 'acc-1', provider: 'instagram', username: 'demo', displayName: 'Demo Account', providerAccountId: 'ig-1', state: 'CONNECTED'
  }), {
    id: 'acc-1', provider: 'instagram', providerLabel: 'Instagram', identity: '@demo', displayName: 'Demo Account',
    state: 'CONNECTED', canReconnect: true, canDisconnect: true
  });
});

test('disconnected Instagram account supports reconnect but not disconnect', () => {
  const model = buildAccountViewModel({ id: 'acc-2', provider: 'instagram', providerAccountId: 'ig-2', state: 'DISCONNECTED' });
  assert.equal(model.identity, 'ig-2'); assert.equal(model.canReconnect, true); assert.equal(model.canDisconnect, false);
});

test('Facebook Page and Threads accounts support reconnect through provider OAuth', () => {
  const facebook = buildAccountViewModel({ id:'acc-fb', provider:'facebook', displayName:'Page Name', providerAccountId:'page-1', state:'CONNECTED' });
  assert.equal(facebook.providerLabel, 'Facebook'); assert.equal(facebook.identity, 'page-1'); assert.equal(facebook.canReconnect, true); assert.equal(facebook.canDisconnect, true);
  const threads = buildAccountViewModel({ id:'acc-th', provider:'threads', username:'threader', providerAccountId:'threads-1', state:'DISCONNECTED' });
  assert.equal(threads.providerLabel, 'Threads'); assert.equal(threads.identity, '@threader'); assert.equal(threads.canReconnect, true); assert.equal(threads.canDisconnect, false);
});

test('TikTok remains unsupported for OAuth reconnect until its provider adapter exists', () => {
  const model = buildAccountViewModel({ id:'acc-tt', provider:'tiktok', displayName:'TikTok', state:'CONNECTED' });
  assert.equal(model.providerLabel, 'TikTok'); assert.equal(model.canReconnect, false); assert.equal(model.canDisconnect, true);
});
