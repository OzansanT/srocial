import { validateTikTokPost } from './validator.js';

function providerError(code, retryable = false) {
  const error = new Error(code);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function normalizeCreatorInfo(payload) {
  const data = payload?.data ?? {};
  return {
    creatorUsername: String(data.creator_username ?? '').trim() || null,
    creatorNickname: String(data.creator_nickname ?? '').trim() || null,
    privacyLevelOptions: Array.isArray(data.privacy_level_options)
      ? data.privacy_level_options.map((value) => String(value).trim()).filter(Boolean)
      : [],
    commentDisabled: data.comment_disabled === true,
    duetDisabled: data.duet_disabled === true,
    stitchDisabled: data.stitch_disabled === true,
    maxVideoPostDurationSec: Number.isFinite(Number(data.max_video_post_duration_sec))
      ? Number(data.max_video_post_duration_sec)
      : null
  };
}

function assertCreatorOptions(creatorInfo, options) {
  if (!creatorInfo.privacyLevelOptions.includes(options.privacyLevel)) throw providerError('PRIVACY_OPTION_UNAVAILABLE');
  if ((options.allowComment && creatorInfo.commentDisabled) ||
      (options.allowDuet && creatorInfo.duetDisabled) ||
      (options.allowStitch && creatorInfo.stitchDisabled)) {
    throw providerError('INTERACTION_UNAVAILABLE');
  }
  if (options.commercialContent && !options.brandOrganic && !options.brandContent) throw providerError('COMMERCIAL_DISCLOSURE_REQUIRED');
}

function videoBody(caption, mediaUrl, options) {
  return {
    post_info: {
      title: caption,
      privacy_level: options.privacyLevel,
      disable_comment: !options.allowComment,
      disable_duet: !options.allowDuet,
      disable_stitch: !options.allowStitch,
      brand_content_toggle: options.brandContent,
      brand_organic_toggle: options.brandOrganic,
      is_aigc: options.isAigc
    },
    source_info: { source: 'PULL_FROM_URL', video_url: mediaUrl }
  };
}

function photoBody(caption, mediaUrl, options) {
  return {
    media_type: 'PHOTO',
    post_mode: 'DIRECT_POST',
    post_info: {
      description: caption,
      privacy_level: options.privacyLevel,
      disable_comment: !options.allowComment,
      brand_content_toggle: options.brandContent,
      brand_organic_toggle: options.brandOrganic
    },
    source_info: { source: 'PULL_FROM_URL', photo_images: [mediaUrl], photo_cover_index: 0 }
  };
}

function statusFailureCode(reason) {
  const normalized = String(reason ?? '').toLowerCase();
  if (normalized.includes('file') || normalized.includes('format') || normalized.includes('media') || normalized.includes('photo') || normalized.includes('video')) return 'MEDIA_ERROR';
  if (normalized.includes('url') || normalized.includes('download')) return 'MEDIA_ERROR';
  return 'PROVIDER_ERROR';
}

export function createTikTokPublishingAdapter({ client, resolveCredentials, getMedia } = {}) {
  if (!client || typeof client.postApi !== 'function') throw new Error('TIKTOK_CLIENT_REQUIRED');
  if (typeof resolveCredentials !== 'function' || typeof getMedia !== 'function') throw new Error('TIKTOK_RUNTIME_DEPENDENCIES_REQUIRED');

  async function credentials(accountId) {
    if (!String(accountId ?? '').trim()) throw providerError('AUTH_ERROR');
    return resolveCredentials(accountId);
  }

  async function getCreatorInfo({ accountId } = {}) {
    const auth = await credentials(accountId);
    const payload = await client.postApi('/v2/post/publish/creator_info/query/', {
      accessToken: auth.accessToken,
      body: {}
    });
    return normalizeCreatorInfo(payload);
  }

  async function publish({ post, publication } = {}) {
    const auth = await credentials(publication?.accountId);
    const media = await getMedia(post?.id);
    const validated = validateTikTokPost({ post, media, options: publication?.providerOptions });
    const creatorInfo = normalizeCreatorInfo(await client.postApi('/v2/post/publish/creator_info/query/', {
      accessToken: auth.accessToken,
      body: {}
    }));
    assertCreatorOptions(creatorInfo, validated.options);

    const path = validated.media.type === 'video'
      ? '/v2/post/publish/video/init/'
      : '/v2/post/publish/content/init/';
    const body = validated.media.type === 'video'
      ? videoBody(validated.caption, validated.media.url, validated.options)
      : photoBody(validated.caption, validated.media.url, validated.options);
    const payload = await client.postApi(path, { accessToken: auth.accessToken, body });
    const externalId = String(payload?.data?.publish_id ?? '').trim();
    if (!externalId) throw providerError('PROVIDER_ERROR', true);
    return { status: 'PROCESSING', externalId };
  }

  async function getStatus({ publication } = {}) {
    const externalId = String(publication?.externalId ?? '').trim();
    if (!externalId) throw providerError('PROVIDER_ERROR');
    const auth = await credentials(publication?.accountId);
    const payload = await client.postApi('/v2/post/publish/status/fetch/', {
      accessToken: auth.accessToken,
      body: { publish_id: externalId }
    });
    const status = String(payload?.data?.status ?? '').trim().toUpperCase();
    if (status === 'PUBLISH_COMPLETE') return { status: 'PUBLISHED', externalId };
    if (status === 'PROCESSING_DOWNLOAD' || status === 'PROCESSING_UPLOAD' || status === 'PROCESSING') {
      return { status: 'PROCESSING', externalId };
    }
    if (status === 'FAILED') {
      return { status: 'FAILED', externalId, errorCode: statusFailureCode(payload?.data?.fail_reason) };
    }
    throw providerError('PROVIDER_ERROR', true);
  }

  return {
    name: 'tiktok',
    capabilities: { text: false, image: true, video: true, carousel: false },
    getCreatorInfo,
    publish,
    getStatus,
    validatePost: validateTikTokPost
  };
}
