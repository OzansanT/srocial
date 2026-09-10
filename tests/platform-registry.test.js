import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformRegistry, registerPlatform } from '../server/platforms/registry.js';

test('registerPlatform stores an adapter by normalized name', () => {
  const registry = createPlatformRegistry();
  const adapter = { publish() {} };
  registerPlatform(registry, ' Instagram ', adapter);
  assert.equal(registry.get('instagram'), adapter);
});

test('registerPlatform rejects duplicate names', () => {
  const registry = createPlatformRegistry();
  registerPlatform(registry, 'threads', {});
  assert.throws(() => registerPlatform(registry, 'THREADS', {}), /already registered/i);
});

test('registerPlatform rejects empty names', () => {
  assert.throws(() => registerPlatform(createPlatformRegistry(), '   ', {}), /name is required/i);
});
