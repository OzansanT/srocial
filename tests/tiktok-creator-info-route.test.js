import test from 'node:test';
import assert from 'node:assert/strict';
import { getTikTokCreatorInfoPayload } from '../server/routes/tiktok.js';

const creatorInfo={
  creatorUsername:'creator', creatorNickname:'Creator', privacyLevelOptions:['SELF_ONLY'],
  commentDisabled:false, duetDisabled:true, stitchDisabled:true, maxVideoPostDurationSec:180
};

function repository(account){ return { async getAccount(id){ return account?.id === id ? structuredClone(account) : null; } }; }

test('creator info route returns normalized TikTok creator capabilities for connected account', async () => {
  const account={ id:'tt-1', provider:'tiktok', state:'CONNECTED' };
  const platformRegistry=new Map([['tiktok',{ async getCreatorInfo({accountId}){ assert.equal(accountId,'tt-1'); return creatorInfo; } }]]);
  assert.deepEqual(await getTikTokCreatorInfoPayload(repository(account), platformRegistry, 'tt-1'), {
    statusCode:200, payload:{ creatorInfo }
  });
});

test('creator info route rejects missing, wrong-provider, disconnected, or unavailable adapter states safely', async () => {
  assert.deepEqual(await getTikTokCreatorInfoPayload(repository(null), new Map(), 'missing'), { statusCode:404, payload:{ error:'account_not_found' } });
  assert.deepEqual(await getTikTokCreatorInfoPayload(repository({id:'a',provider:'instagram',state:'CONNECTED'}), new Map(), 'a'), { statusCode:409, payload:{ error:'account_not_tiktok' } });
  assert.deepEqual(await getTikTokCreatorInfoPayload(repository({id:'a',provider:'tiktok',state:'EXPIRED'}), new Map(), 'a'), { statusCode:409, payload:{ error:'account_not_connected' } });
  assert.deepEqual(await getTikTokCreatorInfoPayload(repository({id:'a',provider:'tiktok',state:'CONNECTED'}), new Map(), 'a'), { statusCode:503, payload:{ error:'tiktok_not_configured' } });
});

test('creator info route exposes normalized provider error codes without raw provider messages', async () => {
  const account={id:'tt-1',provider:'tiktok',state:'CONNECTED'};
  const error=new Error('sensitive provider text'); error.code='RATE_LIMIT'; error.retryable=true;
  const registry=new Map([['tiktok',{ async getCreatorInfo(){ throw error; } }]]);
  assert.deepEqual(await getTikTokCreatorInfoPayload(repository(account), registry, 'tt-1'), { statusCode:429, payload:{ error:'rate_limit' } });
});
