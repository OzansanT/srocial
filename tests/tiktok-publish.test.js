import test from 'node:test';
import assert from 'node:assert/strict';
import { createTikTokPublishingAdapter } from '../server/platforms/tiktok/publish.js';
import { validateTikTokPost } from '../server/platforms/tiktok/validator.js';

const creatorInfo = {
  creatorUsername: 'creator', creatorNickname: 'Creator',
  privacyLevelOptions: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'],
  commentDisabled: false, duetDisabled: false, stitchDisabled: true,
  maxVideoPostDurationSec: 300
};

function adapter({ media = [{ type: 'video', url: 'https://media.example/video.mp4' }], clientOverrides = {} } = {}) {
  const calls = [];
  const client = {
    async postApi(path, options) {
      calls.push({ path, options });
      if (path === '/v2/post/publish/creator_info/query/') return {
        data: {
          creator_username: 'creator', creator_nickname: 'Creator',
          privacy_level_options: creatorInfo.privacyLevelOptions,
          comment_disabled: false, duet_disabled: false, stitch_disabled: true,
          max_video_post_duration_sec: 300
        }
      };
      if (path === '/v2/post/publish/video/init/') return { data: { publish_id: 'video-publish-1' } };
      if (path === '/v2/post/publish/content/init/') return { data: { publish_id: 'photo-publish-1' } };
      if (path === '/v2/post/publish/status/fetch/') return { data: { status: 'PROCESSING_DOWNLOAD' } };
      throw new Error(`unexpected ${path}`);
    },
    ...clientOverrides
  };
  return {
    calls,
    publishing: createTikTokPublishingAdapter({
      client,
      resolveCredentials: async (accountId) => ({ accountId, providerAccountId: 'open-1', accessToken: 'access-1' }),
      getMedia: async () => structuredClone(media)
    })
  };
}

const options = {
  privacyLevel: 'MUTUAL_FOLLOW_FRIENDS',
  allowComment: true,
  allowDuet: true,
  allowStitch: false,
  commercialContent: false,
  brandOrganic: false,
  brandContent: false,
  isAigc: false,
  consent: true
};

test('TikTok requires exactly one image or video and explicit consent metadata', () => {
  assert.throws(() => validateTikTokPost({ post: { caption: 'x' }, media: [] , options }), (error) => error.code === 'MEDIA_REQUIRED');
  assert.throws(() => validateTikTokPost({ post: { caption: 'x' }, media: [{ type:'image', url:'https://a.example/1.jpg' }, { type:'image', url:'https://a.example/2.jpg' }], options }), (error) => error.code === 'MEDIA_COUNT_UNSUPPORTED');
  assert.throws(() => validateTikTokPost({ post: { caption: 'x' }, media: [{ type:'image', url:'https://a.example/1.jpg' }], options: { ...options, consent:false } }), (error) => error.code === 'CONSENT_REQUIRED');
});

test('returns creator info in UI-friendly normalized shape', async () => {
  const { publishing } = adapter();
  assert.deepEqual(await publishing.getCreatorInfo({ accountId:'acc-tt' }), creatorInfo);
});

test('publishes TikTok video with user-selected privacy and interactions', async () => {
  const { publishing, calls } = adapter();
  const result = await publishing.publish({
    post: { id:'post-1', caption:'Video caption' },
    publication: { accountId:'acc-tt', providerOptions:options }
  });
  assert.deepEqual(result, { status:'PROCESSING', externalId:'video-publish-1' });
  assert.equal(calls[0].path, '/v2/post/publish/creator_info/query/');
  assert.equal(calls[1].path, '/v2/post/publish/video/init/');
  assert.deepEqual(calls[1].options.body, {
    post_info: {
      title:'Video caption', privacy_level:'MUTUAL_FOLLOW_FRIENDS',
      disable_comment:false, disable_duet:false, disable_stitch:true,
      brand_content_toggle:false, brand_organic_toggle:false, is_aigc:false
    },
    source_info: { source:'PULL_FROM_URL', video_url:'https://media.example/video.mp4' }
  });
});

test('publishes TikTok photo through content init', async () => {
  const { publishing, calls } = adapter({ media:[{ type:'image', url:'https://media.example/photo.webp' }] });
  const result = await publishing.publish({
    post:{ id:'post-1', caption:'Photo description' },
    publication:{ accountId:'acc-tt', providerOptions:{ ...options, allowDuet:false, allowStitch:false } }
  });
  assert.deepEqual(result, { status:'PROCESSING', externalId:'photo-publish-1' });
  assert.equal(calls[1].path, '/v2/post/publish/content/init/');
  assert.deepEqual(calls[1].options.body, {
    media_type:'PHOTO', post_mode:'DIRECT_POST', is_aigc:false,
    post_info:{
      description:'Photo description', privacy_level:'MUTUAL_FOLLOW_FRIENDS',
      disable_comment:false, brand_content_toggle:false, brand_organic_toggle:false
    },
    source_info:{ source:'PULL_FROM_URL', photo_images:['https://media.example/photo.webp'], photo_cover_index:0 }
  });
});

test('fails closed when current creator options no longer allow selected privacy or interaction', async () => {
  const { publishing } = adapter();
  await assert.rejects(() => publishing.publish({
    post:{ id:'post-1', caption:'x' },
    publication:{ accountId:'acc-tt', providerOptions:{ ...options, privacyLevel:'FOLLOWER_OF_CREATOR' } }
  }), (error) => error.code === 'PRIVACY_OPTION_UNAVAILABLE');
  await assert.rejects(() => publishing.publish({
    post:{ id:'post-1', caption:'x' },
    publication:{ accountId:'acc-tt', providerOptions:{ ...options, allowStitch:true } }
  }), (error) => error.code === 'INTERACTION_UNAVAILABLE');
});

test('maps TikTok asynchronous status into generic publication states', async () => {
  for (const [providerStatus, expected] of [
    ['PROCESSING_DOWNLOAD', { status:'PROCESSING', externalId:'pub-1' }],
    ['PROCESSING_UPLOAD', { status:'PROCESSING', externalId:'pub-1' }],
    ['PUBLISH_COMPLETE', { status:'PUBLISHED', externalId:'pub-1' }],
    ['FAILED', { status:'FAILED', externalId:'pub-1', errorCode:'MEDIA_ERROR' }]
  ]) {
    const { publishing } = adapter({ clientOverrides:{
      async postApi(path) {
        if (path === '/v2/post/publish/status/fetch/') return { data:{ status:providerStatus, fail_reason:providerStatus === 'FAILED' ? 'file_format_check_failed' : null } };
        if (path === '/v2/post/publish/creator_info/query/') return { data:{} };
        throw new Error(path);
      }
    }});
    assert.deepEqual(await publishing.getStatus({ publication:{ accountId:'acc-tt', externalId:'pub-1' } }), expected);
  }
});
