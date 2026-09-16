import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountViewModel } from '../client/js/pages/accounts.js';

test('connected Instagram account supports reconnect and disconnect', () => {
  assert.deepEqual(buildAccountViewModel({
    id: 'acc-1', provider: 'instagram', username: 'demo', displayName: 'Demo Account', providerAccountId: 'ig-1', state: 'CONNECTED'
  }), {
    id: 'acc-1', provider: 'instagram', providerLabel: 'Instagram', identity: '@demo', displayName: 'Demo Account',
    state: 'CONNECTED', healthState: 'CONNECTED', healthMessage: '', reconnectNeeded: false,
    canReconnect: true, reconnectLabel: 'Reconnect', canDisconnect: true
  });
});

test('expiring account shows a source-defined remaining lifetime warning', () => {
  const model = buildAccountViewModel({
    id:'acc-expiring', provider:'instagram', providerAccountId:'ig-expiring', state:'CONNECTED',
    healthState:'EXPIRING', expirationWarning:true, expiresInDays:8, reconnectNeeded:false, reconnectReason:null
  });
  assert.equal(model.healthState, 'EXPIRING');
  assert.equal(model.healthMessage, 'Token expires in 8 days.');
  assert.equal(model.reconnectLabel, 'Reconnect');
});

test('expiring account uses singular day wording', () => {
  const model = buildAccountViewModel({
    id:'acc-one-day', provider:'instagram', providerAccountId:'ig-one-day', state:'CONNECTED',
    healthState:'EXPIRING', expirationWarning:true, expiresInDays:1, reconnectNeeded:false, reconnectReason:null
  });
  assert.equal(model.healthMessage, 'Token expires in 1 day.');
});

test('reconnect-needed accounts distinguish safe operator reasons and use Reconnect', () => {
  const cases = [
    ['expired', 'Reconnect needed: token expired.'],
    ['permission_revoked', 'Reconnect needed: provider permission was revoked.'],
    ['disconnected', 'Reconnect needed: account is disconnected.'],
    ['error', 'Reconnect needed: account connection error.']
  ];
  for (const [reconnectReason, healthMessage] of cases) {
    const model = buildAccountViewModel({
      id:`acc-${reconnectReason}`, provider:'instagram', providerAccountId:`ig-${reconnectReason}`,
      state:reconnectReason === 'expired' ? 'EXPIRED' : 'DISCONNECTED',
      healthState:'RECONNECT_NEEDED', reconnectNeeded:true, reconnectReason
    });
    assert.equal(model.healthMessage, healthMessage);
    assert.equal(model.reconnectLabel, 'Reconnect');
    assert.equal(model.canReconnect, true);
    assert.equal(model.canDisconnect, false);
  }
});

test('disconnected Instagram account supports reconnect but not disconnect', () => {
  const model = buildAccountViewModel({
    id: 'acc-2', provider: 'instagram', providerAccountId: 'ig-2', state: 'DISCONNECTED',
    healthState:'RECONNECT_NEEDED', reconnectNeeded:true, reconnectReason:'disconnected'
  });
  assert.equal(model.identity, 'ig-2'); assert.equal(model.canReconnect, true); assert.equal(model.canDisconnect, false);
  assert.equal(model.reconnectLabel, 'Reconnect');
});

test('Facebook Page and Threads accounts support reconnect through provider OAuth', () => {
  const facebook = buildAccountViewModel({ id:'acc-fb', provider:'facebook', displayName:'Page Name', providerAccountId:'page-1', state:'CONNECTED' });
  assert.equal(facebook.providerLabel, 'Facebook'); assert.equal(facebook.identity, 'page-1'); assert.equal(facebook.canReconnect, true); assert.equal(facebook.canDisconnect, true);
  const threads = buildAccountViewModel({
    id:'acc-th', provider:'threads', username:'threader', providerAccountId:'threads-1', state:'DISCONNECTED',
    healthState:'RECONNECT_NEEDED', reconnectNeeded:true, reconnectReason:'disconnected'
  });
  assert.equal(threads.providerLabel, 'Threads'); assert.equal(threads.identity, '@threader'); assert.equal(threads.canReconnect, true); assert.equal(threads.canDisconnect, false);
  assert.equal(threads.reconnectLabel, 'Reconnect');
});

test('TikTok account supports reconnect through provider OAuth', () => {
  const model = buildAccountViewModel({ id:'acc-tt', provider:'tiktok', displayName:'TikTok', state:'CONNECTED' });
  assert.equal(model.providerLabel, 'TikTok'); assert.equal(model.canReconnect, true); assert.equal(model.canDisconnect, true);
});
