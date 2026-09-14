import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComposerPayload } from '../client/js/pages/composer.js';
import { createScheduledPost } from '../server/services/post-service.js';

function form(entries) {
  const map = new Map(entries);
  return {
    get(name) { return map.get(name) ?? null; },
    getAll(name) { const value = map.get(name); return Array.isArray(value) ? value : value == null ? [] : [value]; }
  };
}

const account = { id:'tt-1', provider:'tiktok', state:'CONNECTED', displayName:'Creator' };
const options = {
  privacyLevel:'SELF_ONLY', allowComment:true, allowDuet:false, allowStitch:false,
  commercialContent:false, brandOrganic:false, brandContent:false, isAigc:true, consent:true
};

function repository() {
  const records = { posts:[], media:[], publications:[], jobs:[] };
  return {
    records,
    async getAccount(id){ return id === account.id ? structuredClone(account) : null; },
    async createPost(record){ const item={id:'post-1',...record}; records.posts.push(item); return structuredClone(item); },
    async createMedia(record){ const item={id:'media-1',...record}; records.media.push(item); return structuredClone(item); },
    async createPublication(record){ const item={id:'pub-1',...record}; records.publications.push(item); return structuredClone(item); },
    async createJob(record){ const item={id:'job-1',...record}; records.jobs.push(item); return structuredClone(item); }
  };
}

test('composer attaches explicit TikTok Direct Post settings to its destination', () => {
  const payload = buildComposerPayload({
    formData: form([
      ['caption','TikTok video'], ['scheduledAt','2026-09-15T13:00'], ['platform',['tiktok']], ['account:tiktok','tt-1'],
      ['mediaType','video'], ['mediaUrl','https://media.example/video.mp4'],
      ['tiktok:privacyLevel','SELF_ONLY'], ['tiktok:allowComment','on'], ['tiktok:isAigc','on'], ['tiktok:consent','on']
    ]),
    accounts:[account]
  });
  assert.deepEqual(payload.destinations, [{ platform:'tiktok', accountId:'tt-1', options }]);
});

test('composer refuses TikTok scheduling without manual privacy selection and consent', () => {
  for (const entries of [
    [['tiktok:privacyLevel',''], ['tiktok:consent','on']],
    [['tiktok:privacyLevel','SELF_ONLY'], ['tiktok:consent',null]]
  ]) {
    const base = [
      ['caption','TikTok'], ['scheduledAt','2026-09-15T13:00'], ['platform',['tiktok']], ['account:tiktok','tt-1'],
      ['mediaType','video'], ['mediaUrl','https://media.example/video.mp4'], ...entries
    ];
    assert.throws(() => buildComposerPayload({ formData:form(base), accounts:[account] }), /TikTok/i);
  }
});

test('post service persists TikTok provider options and enforces exactly one media item before persistence', async () => {
  const repo = repository();
  const result = await createScheduledPost(repo, {
    caption:'TikTok', destinations:[{ platform:'tiktok', accountId:'tt-1', options }],
    media:[{ type:'video', url:'https://media.example/video.mp4' }], scheduledAt:'2026-09-15T10:00:00.000Z'
  }, { now:new Date('2026-09-14T10:00:00.000Z') });
  assert.deepEqual(result.publications[0].providerOptions, options);

  const bad = repository();
  await assert.rejects(() => createScheduledPost(bad, {
    caption:'Bad TikTok', destinations:[{ platform:'tiktok', accountId:'tt-1', options }],
    media:[], scheduledAt:'2026-09-15T10:00:00.000Z'
  }, { now:new Date('2026-09-14T10:00:00.000Z') }), (error) => {
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.ok(error.details.some((item) => item.field === 'media' && /TikTok/i.test(item.message)));
    return true;
  });
  assert.equal(bad.records.posts.length, 0);
});
