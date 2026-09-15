import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../server/auth/password-hash.js';
import { ROLES, normalizeRole, roleAtLeast } from '../server/auth/roles.js';
import { requiredRoleForRequest } from '../server/auth/authorization-policy.js';

test('password hashing round-trips without deterministic ciphertext', async () => {
  const first = await hashPassword('correct-horse-battery');
  const second = await hashPassword('correct-horse-battery');

  assert.match(first, /^scrypt\$v1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('correct-horse-battery', first), true);
  assert.equal(await verifyPassword('wrong-password-value', first), false);
  assert.equal(await verifyPassword('correct-horse-battery', 'not-a-valid-hash'), false);
});

test('roles normalize to the four source-defined access levels and preserve ordering', () => {
  assert.equal(normalizeRole('admin'), ROLES.ADMIN);
  assert.equal(normalizeRole('Manager'), ROLES.MANAGER);
  assert.equal(normalizeRole('editor'), ROLES.EDITOR);
  assert.equal(normalizeRole('viewer'), ROLES.VIEWER);
  assert.throws(() => normalizeRole('owner'), /role/i);

  assert.equal(roleAtLeast(ROLES.ADMIN, ROLES.MANAGER), true);
  assert.equal(roleAtLeast(ROLES.MANAGER, ROLES.EDITOR), true);
  assert.equal(roleAtLeast(ROLES.EDITOR, ROLES.VIEWER), true);
  assert.equal(roleAtLeast(ROLES.VIEWER, ROLES.EDITOR), false);
});

test('authorization policy classifies representative Viewer Editor Manager and Admin routes', () => {
  assert.equal(requiredRoleForRequest('GET', '/api/dashboard'), ROLES.VIEWER);
  assert.equal(requiredRoleForRequest('GET', '/api/analytics'), ROLES.VIEWER);
  assert.equal(requiredRoleForRequest('POST', '/api/posts'), ROLES.EDITOR);
  assert.equal(requiredRoleForRequest('POST', '/api/media/uploads'), ROLES.EDITOR);
  assert.equal(requiredRoleForRequest('DELETE', '/api/media/example.png'), ROLES.MANAGER);
  assert.equal(requiredRoleForRequest('POST', '/api/oauth/instagram/start'), ROLES.MANAGER);
  assert.equal(requiredRoleForRequest('POST', '/api/analytics/refresh'), ROLES.MANAGER);
  assert.equal(requiredRoleForRequest('GET', '/api/users'), ROLES.ADMIN);
  assert.equal(requiredRoleForRequest('POST', '/api/users'), ROLES.ADMIN);
  assert.equal(requiredRoleForRequest('POST', '/api/future-dangerous-action'), ROLES.ADMIN);
  assert.equal(requiredRoleForRequest('GET', '/api/future-report'), ROLES.VIEWER);
});
