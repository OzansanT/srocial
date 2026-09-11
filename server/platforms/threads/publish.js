import { validateThreadsPost } from './validator.js';

function adapterError(code, retryable = false) {
  const error = new Error(code);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function requireAccountId(publication) {
  const value = String(publication?.accountId ?? '').trim();
  if (!value) throw adapterError('ACCOUNT_REQUIRED');
  return value;
}

function requireId(value) {
  const id = String(value ?? '').trim();
  if (!id) throw adapterError('PROVIDER_ERROR');
  return id;
}

function normalizeStatus(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function createThreadsPublishingAdapter({ client, resolveCredentials, getMedia } = {}) {
  if (!client || typeof resolveCredentials !== 'function' || typeof getMedia !== 'function') {
    throw new Error('THREADS_PUBLISHING_DEPENDENCIES_REQUIRED');
  }

  const capabilities = Object.freeze({ text: true, image: true, video: true, carousel: false });

  async function validatePost({ post, publication } = {}) {
    requireAccountId(publication);
    const media = await getMedia(post?.id);
    return validateThreadsPost({ post, media });
  }

  async function inspectContainer(containerId, accessToken) {
    return client.getGraph(`/${containerId}`, {
      accessToken,
      query: { fields: 'id,status,error_message' }
    });
  }

  async function publishContainer(containerId, accessToken) {
    const result = await client.postGraph('/me/threads_publish', {
      accessToken,
      body: { creation_id: containerId }
    });
    return {
      status: 'PUBLISHED',
      externalId: requireId(result?.id),
      containerId
    };
  }

  async function stateResult(payload, containerId, accessToken) {
    const status = normalizeStatus(payload?.status);
    if (status === 'FINISHED') return publishContainer(containerId, accessToken);
    if (status === 'IN_PROGRESS') return { status: 'PROCESSING', externalId: containerId };
    if (status === 'ERROR') return { status: 'FAILED', externalId: containerId, errorCode: 'MEDIA_ERROR' };
    if (status === 'EXPIRED') return { status: 'FAILED', externalId: containerId, errorCode: 'MEDIA_EXPIRED' };
    if (status === 'PUBLISHED') return { status: 'PUBLISHED', externalId: containerId };
    return { status: 'PROCESSING', externalId: containerId };
  }

  async function publish({ post = {}, publication = {} } = {}) {
    const accountId = requireAccountId(publication);
    const media = await getMedia(post.id);
    const normalized = validateThreadsPost({ post, media });
    const credentials = await resolveCredentials(accountId);
    const accessToken = String(credentials?.accessToken ?? '').trim();
    if (!accessToken) throw adapterError('AUTH_ERROR');

    let body;
    if (!normalized.media) {
      body = { media_type: 'TEXT', text: normalized.text };
    } else if (normalized.media.type === 'image') {
      body = { media_type: 'IMAGE', image_url: normalized.media.url, text: normalized.text };
    } else {
      body = { media_type: 'VIDEO', video_url: normalized.media.url, text: normalized.text };
    }

    const created = await client.postGraph('/me/threads', { accessToken, body });
    const containerId = requireId(created?.id);
    const status = await inspectContainer(containerId, accessToken);
    return stateResult(status, containerId, accessToken);
  }

  async function getStatus({ publication = {} } = {}) {
    const accountId = requireAccountId(publication);
    const containerId = requireId(publication.externalId);
    const credentials = await resolveCredentials(accountId);
    const accessToken = String(credentials?.accessToken ?? '').trim();
    if (!accessToken) throw adapterError('AUTH_ERROR');
    const status = await inspectContainer(containerId, accessToken);
    return stateResult(status, containerId, accessToken);
  }

  return { capabilities, validatePost, publish, getStatus };
}
