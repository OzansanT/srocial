import { validateFacebookPost } from './validator.js';

function adapterError(code, retryable = false) {
  const error = new Error(code);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function accountId(publication) {
  const value = String(publication?.accountId ?? '').trim();
  if (!value) throw adapterError('ACCOUNT_REQUIRED');
  return value;
}

function requireId(value) {
  const id = String(value ?? '').trim();
  if (!id) throw adapterError('PROVIDER_ERROR');
  return id;
}

function videoState(payload) {
  const videoStatus = String(payload?.status?.video_status ?? '').toLowerCase();
  const phase = String(payload?.status?.publishing_phase?.status ?? '').toLowerCase();
  if (videoStatus === 'published' || phase === 'complete' || phase === 'completed') return 'PUBLISHED';
  if (videoStatus === 'error' || videoStatus === 'failed' || phase === 'error' || phase === 'failed') return 'FAILED';
  return 'PROCESSING';
}

export function createFacebookPublishingAdapter({ client, resolveCredentials, getMedia } = {}) {
  if (!client || typeof resolveCredentials !== 'function' || typeof getMedia !== 'function') {
    throw new Error('FACEBOOK_PUBLISHING_DEPENDENCIES_REQUIRED');
  }

  const capabilities = Object.freeze({ text: true, image: true, video: true, carousel: false });

  async function validatePost({ post, publication } = {}) {
    accountId(publication);
    const media = await getMedia(post?.id);
    return validateFacebookPost({ post, media });
  }

  async function publish({ post = {}, publication = {} } = {}) {
    const boundAccountId = accountId(publication);
    const media = await getMedia(post.id);
    const normalized = validateFacebookPost({ post, media });
    const credentials = await resolveCredentials(boundAccountId);
    const pageId = requireId(credentials?.providerAccountId);
    const accessToken = String(credentials?.accessToken ?? '');
    if (!accessToken) throw adapterError('AUTH_ERROR');

    if (!normalized.media) {
      const result = await client.postGraph(`/${pageId}/feed`, {
        accessToken,
        body: { message: normalized.caption }
      });
      return { status: 'PUBLISHED', externalId: requireId(result?.id) };
    }

    if (normalized.media.type === 'image') {
      const result = await client.postGraph(`/${pageId}/photos`, {
        accessToken,
        body: { url: normalized.media.url, caption: normalized.caption, published: true }
      });
      const mediaId = requireId(result?.id);
      const externalId = String(result?.post_id ?? '').trim() || mediaId;
      return { status: 'PUBLISHED', externalId, mediaId };
    }

    const start = await client.postGraph(`/${pageId}/video_reels`, {
      accessToken,
      body: { upload_phase: 'start' }
    });
    const videoId = requireId(start?.video_id);
    const uploadUrl = String(start?.upload_url ?? '').trim();
    if (!uploadUrl) throw adapterError('PROVIDER_ERROR');
    await client.postHostedVideo(uploadUrl, { accessToken, fileUrl: normalized.media.url });
    await client.postGraph(`/${pageId}/video_reels`, {
      accessToken,
      body: {
        upload_phase: 'finish',
        video_id: videoId,
        video_state: 'PUBLISHED',
        description: normalized.caption
      }
    });
    return { status: 'PROCESSING', externalId: videoId };
  }

  async function getStatus({ publication = {} } = {}) {
    const boundAccountId = accountId(publication);
    const externalId = requireId(publication.externalId);
    const credentials = await resolveCredentials(boundAccountId);
    const accessToken = String(credentials?.accessToken ?? '');
    if (!accessToken) throw adapterError('AUTH_ERROR');
    const payload = await client.getGraph(`/${externalId}`, {
      accessToken,
      query: { fields: 'id,status' }
    });
    const state = videoState(payload);
    if (state === 'PUBLISHED') return { status: 'PUBLISHED', externalId };
    if (state === 'FAILED') return { status: 'FAILED', externalId, errorCode: 'MEDIA_ERROR' };
    return { status: 'PROCESSING', externalId };
  }

  return { capabilities, validatePost, publish, getStatus };
}
