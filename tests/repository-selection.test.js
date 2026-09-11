import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepositoryFromEnvironment } from '../server/db/create-repository.js';


test('defaults to JSON repository when DATABASE_DRIVER is absent', () => {
  const repository = createRepositoryFromEnvironment({ DATA_FILE: './data/test-srocial.json' });
  assert.equal(typeof repository.initialize, 'function');
  assert.equal(typeof repository.createPost, 'function');
});


test('selects PostgreSQL only when DATABASE_DRIVER=postgres', () => {
  const repository = createRepositoryFromEnvironment({
    DATABASE_DRIVER: 'postgres',
    DATABASE_URL: 'postgres://srocial:test@127.0.0.1:5432/srocial_test'
  });
  assert.equal(typeof repository.initialize, 'function');
  assert.equal(typeof repository.healthCheck, 'function');
  assert.equal(typeof repository.close, 'function');
});


test('requires DATABASE_URL for explicit PostgreSQL selection', () => {
  assert.throws(
    () => createRepositoryFromEnvironment({ DATABASE_DRIVER: 'postgres', DATABASE_URL: '   ' }),
    /DATABASE_URL_REQUIRED/
  );
});


test('rejects unsupported repository drivers', () => {
  assert.throws(
    () => createRepositoryFromEnvironment({ DATABASE_DRIVER: 'sqlite' }),
    /DATABASE_DRIVER_UNSUPPORTED/
  );
});
