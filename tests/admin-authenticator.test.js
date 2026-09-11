import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminAuthenticator } from '../server/auth/admin-authenticator.js';

test('administrator authenticator accepts only the configured username and password', () => {
  const authenticator = createAdminAuthenticator({
    username: 'operator',
    password: 'correct-horse-battery'
  });

  assert.equal(authenticator.authenticate('operator', 'correct-horse-battery'), true);
  assert.equal(authenticator.authenticate('other', 'correct-horse-battery'), false);
  assert.equal(authenticator.authenticate('operator', 'wrong-password-value'), false);
  assert.equal(authenticator.authenticate('', ''), false);
  assert.equal(authenticator.authenticate(undefined, undefined), false);
});

test('administrator authenticator rejects invalid construction inputs', () => {
  assert.throws(() => createAdminAuthenticator({ username: '', password: 'valid-password-value' }), TypeError);
  assert.throws(() => createAdminAuthenticator({ username: 'admin', password: '' }), TypeError);
});
