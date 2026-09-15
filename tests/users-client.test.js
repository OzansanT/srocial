import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('dashboard exposes a hidden Admin-only Users navigation and management panel', async () => {
  const html = await read('client/index.html');
  assert.match(html, /\/css\/pages\/users\.css/);
  assert.match(html, /href="#users"[^>]*data-admin-only[^>]*hidden/);
  assert.match(html, /id="users"[^>]*data-admin-only[^>]*hidden/);
  assert.match(html, /id="user-create-form"/);
  assert.match(html, /id="user-list"/);
  assert.match(html, /id="users-feedback"/);
});

test('users browser API uses the shared JSON client for all administrator operations', async () => {
  const source = await read('client/js/api/users-api.js');
  assert.match(source, /requestJson/);
  assert.match(source, /['"]\/api\/users['"]/);
  assert.match(source, /method:\s*['"]POST['"]/);
  assert.match(source, /method:\s*['"]PATCH['"]/);
  assert.match(source, /\/password/);
  assert.match(source, /\/sessions\/revoke/);
});

test('Users page renders safe DOM and exposes create update password and revoke workflows', async () => {
  const source = await read('client/js/pages/users.js');
  assert.match(source, /from ['"]\.\.\/api\/users-api\.js['"]/);
  assert.match(source, /document\.createElement/);
  assert.match(source, /textContent/);
  assert.match(source, /replaceChildren/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.match(source, /createUser/);
  assert.match(source, /updateUser/);
  assert.match(source, /changeUserPassword/);
  assert.match(source, /revokeUserSessions/);
});

test('app bootstrap exposes Admin-only UI only after the authenticated role is known', async () => {
  const source = await read('client/js/app.js');
  assert.match(source, /initializeUsers/);
  assert.match(source, /session.*user.*role|user.*role.*session/s);
  assert.match(source, /ADMIN/);
  assert.match(source, /data-admin-only/);
  assert.match(source, /initializeSessionControls\(\)/);
});
