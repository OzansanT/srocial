import test from 'node:test';
import assert from 'node:assert/strict';
import { registerTikTokProvider } from '../server/platforms/tiktok/index.js';

function registry() { return new Map(); }

const env = { TIKTOK_CLIENT_KEY:'client-key', TIKTOK_CLIENT_SECRET:'client-secret' };

test('TikTok provider is not registered without complete credentials', () => {
  const oauthRegistry=registry(); const platformRegistry=registry();
  assert.deepEqual(registerTikTokProvider({ env:{}, oauthRegistry, platformRegistry }), { configured:false });
  assert.equal(oauthRegistry.size, 0); assert.equal(platformRegistry.size, 0);
});

test('TikTok provider registers OAuth and publishing adapters when configured', () => {
  const oauthRegistry=registry(); const platformRegistry=registry();
  const repository={ async getAccount(){return null;}, async listMediaForPost(){return [];} };
  const cipher={ decrypt(value){return value;} };
  const result=registerTikTokProvider({ env, oauthRegistry, platformRegistry, repository, cipher, fetchImpl:async()=>{throw new Error('network should not run');} });
  assert.equal(result.configured, true);
  assert.deepEqual(result.scopes, ['user.info.basic','video.publish','video.list']);
  assert.equal(typeof oauthRegistry.get('tiktok')?.exchangeCode, 'function');
  assert.equal(typeof platformRegistry.get('tiktok')?.publish, 'function');
  assert.equal(typeof platformRegistry.get('tiktok')?.getCreatorInfo, 'function');
});
