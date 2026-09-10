import { validateInstagramPublication } from './validator.js';

function adapterError(code, retryable = false) {
  const error = new Error(code);
  error.code = code;
  error.retryable = retryable;
  return error;
}
function requirePublicationAccount(publication) { const accountId = String(publication?.accountId ?? '').trim(); if (!accountId) throw adapterError('ACCOUNT_REQUIRED'); return accountId; }
function requireCredentials(credentials) { if (!credentials?.accessToken || !credentials?.providerAccountId) throw adapterError('AUTH_ERROR'); return credentials; }
function requireContainerId(result) { const id = String(result?.id ?? '').trim(); if (!id) throw adapterError('PROVIDER_ERROR'); return id; }
function normalizeContainerStatus(result) { return String(result?.status_code ?? '').trim().toUpperCase(); }

export function createInstagramPublishingAdapter({ client, resolveCredentials, getMedia } = {}) {
  if (!client || typeof client.postGraph !== 'function' || typeof client.getGraph !== 'function') throw new Error('INSTAGRAM_CLIENT_REQUIRED');
  if (typeof resolveCredentials !== 'function') throw new Error('INSTAGRAM_CREDENTIAL_RESOLVER_REQUIRED');
  if (typeof getMedia !== 'function') throw new Error('INSTAGRAM_MEDIA_RESOLVER_REQUIRED');

  async function publishContainer({ providerAccountId, accessToken, containerId }) {
    const result = await client.postGraph(`/${providerAccountId}/media_publish`, { body: { creation_id: containerId }, accessToken });
    return { status: 'PUBLISHED', externalId: requireContainerId(result), containerId };
  }

  async function inspectContainer({ providerAccountId, accessToken, containerId }) {
    const result = await client.getGraph(`/${containerId}`, { query: { fields: 'status_code,status' }, accessToken });
    const status = normalizeContainerStatus(result);
    if (status === 'FINISHED') return publishContainer({ providerAccountId, accessToken, containerId });
    if (status === 'IN_PROGRESS') return { status: 'PROCESSING', externalId: containerId };
    if (status === 'ERROR' || status === 'EXPIRED') return { status: 'FAILED', externalId: containerId, errorCode: 'MEDIA_ERROR' };
    if (status === 'PUBLISHED') return { status: 'PUBLISHED', externalId: containerId, containerId };
    throw adapterError('PROVIDER_ERROR');
  }

  return {
    async validatePost({ post }) { return validateInstagramPublication({ post, media: await getMedia(post?.id) }); },
    async publish({ post, publication }) {
      const accountId = requirePublicationAccount(publication);
      const normalized = validateInstagramPublication({ post, media: await getMedia(post?.id) });
      const credentials = requireCredentials(await resolveCredentials(accountId));
      const body = normalized.type === 'image'
        ? { image_url: normalized.url, caption: normalized.caption }
        : { video_url: normalized.url, media_type: 'REELS', caption: normalized.caption };
      const created = await client.postGraph(`/${credentials.providerAccountId}/media`, { body, accessToken: credentials.accessToken });
      const containerId = requireContainerId(created);
      if (normalized.type === 'image') return publishContainer({ providerAccountId: credentials.providerAccountId, accessToken: credentials.accessToken, containerId });
      return inspectContainer({ providerAccountId: credentials.providerAccountId, accessToken: credentials.accessToken, containerId });
    },
    async getStatus({ publication }) {
      const accountId = requirePublicationAccount(publication);
      const containerId = String(publication?.externalId ?? '').trim();
      if (!containerId) throw adapterError('PROVIDER_ERROR');
      const credentials = requireCredentials(await resolveCredentials(accountId));
      return inspectContainer({ providerAccountId: credentials.providerAccountId, accessToken: credentials.accessToken, containerId });
    }
  };
}
