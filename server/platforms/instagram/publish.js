import { resolvePublicationContent } from '../publication-content.js';
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
function providerOptionsOf(publication) {
  return publication?.providerOptions && typeof publication.providerOptions === 'object'
    ? publication.providerOptions
    : {};
}
function withCarouselState(publication, state) {
  return { ...providerOptionsOf(publication), instagramCarousel: state };
}
function withoutCarouselState(publication) {
  const { instagramCarousel, ...rest } = providerOptionsOf(publication);
  return rest;
}

export function createInstagramPublishingAdapter({ client, resolveCredentials, getMedia } = {}) {
  if (!client || typeof client.postGraph !== 'function' || typeof client.getGraph !== 'function') throw new Error('INSTAGRAM_CLIENT_REQUIRED');
  if (typeof resolveCredentials !== 'function') throw new Error('INSTAGRAM_CREDENTIAL_RESOLVER_REQUIRED');
  if (typeof getMedia !== 'function') throw new Error('INSTAGRAM_MEDIA_RESOLVER_REQUIRED');

  async function resolveContent(post, publication) {
    const baseMedia = await getMedia(post?.id);
    return resolvePublicationContent({ post, publication, baseMedia });
  }

  async function publishContainer({ providerAccountId, accessToken, containerId }) {
    const result = await client.postGraph(`/${providerAccountId}/media_publish`, { body: { creation_id: containerId }, accessToken });
    return { status: 'PUBLISHED', externalId: requireContainerId(result), containerId };
  }

  async function readContainerStatus({ accessToken, containerId }) {
    const result = await client.getGraph(`/${containerId}`, { query: { fields: 'status_code,status' }, accessToken });
    const status = normalizeContainerStatus(result);
    if (status === 'FINISHED' || status === 'IN_PROGRESS' || status === 'PUBLISHED') return status;
    if (status === 'ERROR' || status === 'EXPIRED') return 'FAILED';
    throw adapterError('PROVIDER_ERROR');
  }

  async function inspectContainer({ providerAccountId, accessToken, containerId }) {
    const status = await readContainerStatus({ accessToken, containerId });
    if (status === 'FINISHED') return publishContainer({ providerAccountId, accessToken, containerId });
    if (status === 'IN_PROGRESS') return { status: 'PROCESSING', externalId: containerId };
    if (status === 'FAILED') return { status: 'FAILED', externalId: containerId, errorCode: 'MEDIA_ERROR' };
    if (status === 'PUBLISHED') return { status: 'PUBLISHED', externalId: containerId, containerId };
    throw adapterError('PROVIDER_ERROR');
  }

  async function createCarouselChildren({ normalized, providerAccountId, accessToken }) {
    const children = [];
    for (const item of normalized.media) {
      const body = item.type === 'image'
        ? { image_url: item.url, is_carousel_item: true }
        : { video_url: item.url, media_type: 'VIDEO', is_carousel_item: true };
      const created = await client.postGraph(`/${providerAccountId}/media`, { body, accessToken });
      children.push({ id: requireContainerId(created), type: item.type });
    }
    return children;
  }

  async function checkCarouselChildren({ publication, credentials, state }) {
    for (const child of state.children) {
      if (child.type !== 'video') continue;
      const status = await readContainerStatus({ accessToken: credentials.accessToken, containerId: child.id });
      if (status === 'FAILED') return { status: 'FAILED', externalId: child.id, errorCode: 'MEDIA_ERROR' };
      if (status === 'IN_PROGRESS') {
        return {
          status: 'PROCESSING',
          externalId: null,
          providerOptions: withCarouselState(publication, state)
        };
      }
    }
    return null;
  }

  async function createCarouselParent({ publication, credentials, state }) {
    const created = await client.postGraph(`/${credentials.providerAccountId}/media`, {
      body: {
        media_type: 'CAROUSEL',
        children: state.children.map((child) => child.id).join(','),
        caption: state.caption
      },
      accessToken: credentials.accessToken
    });
    const parentId = requireContainerId(created);
    const parentState = { ...state, stage: 'parent', parentId };
    return inspectCarouselParent({ publication, credentials, state: parentState });
  }

  async function inspectCarouselParent({ publication, credentials, state }) {
    const parentId = String(state?.parentId ?? '').trim();
    if (!parentId) throw adapterError('PROVIDER_ERROR');
    const status = await readContainerStatus({ accessToken: credentials.accessToken, containerId: parentId });
    if (status === 'FAILED') return { status: 'FAILED', externalId: parentId, errorCode: 'MEDIA_ERROR' };
    if (status === 'IN_PROGRESS') {
      return {
        status: 'PROCESSING',
        externalId: parentId,
        providerOptions: withCarouselState(publication, state)
      };
    }
    if (status === 'PUBLISHED') {
      return {
        status: 'PUBLISHED',
        externalId: parentId,
        providerOptions: withoutCarouselState(publication)
      };
    }
    const published = await publishContainer({
      providerAccountId: credentials.providerAccountId,
      accessToken: credentials.accessToken,
      containerId: parentId
    });
    return { ...published, providerOptions: withoutCarouselState(publication) };
  }

  async function resumeCarousel({ publication, credentials, state }) {
    if (state?.stage === 'children') {
      const pending = await checkCarouselChildren({ publication, credentials, state });
      if (pending) return pending;
      return createCarouselParent({ publication, credentials, state });
    }
    if (state?.stage === 'parent') {
      return inspectCarouselParent({ publication, credentials, state });
    }
    throw adapterError('PROVIDER_ERROR');
  }

  return {
    async validatePost({ post, publication } = {}) {
      const content = await resolveContent(post, publication);
      return validateInstagramPublication({ post: content.post, media: content.media });
    },
    async publish({ post, publication }) {
      const accountId = requirePublicationAccount(publication);
      const content = await resolveContent(post, publication);
      const normalized = validateInstagramPublication({ post: content.post, media: content.media });
      const credentials = requireCredentials(await resolveCredentials(accountId));

      if (normalized.type === 'carousel') {
        const children = await createCarouselChildren({
          normalized,
          providerAccountId: credentials.providerAccountId,
          accessToken: credentials.accessToken
        });
        const state = { stage: 'children', caption: normalized.caption, children };
        const pending = await checkCarouselChildren({ publication, credentials, state });
        if (pending) return pending;
        return createCarouselParent({ publication, credentials, state });
      }

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
      const credentials = requireCredentials(await resolveCredentials(accountId));
      const carouselState = providerOptionsOf(publication).instagramCarousel;
      if (carouselState) return resumeCarousel({ publication, credentials, state: carouselState });

      const containerId = String(publication?.externalId ?? '').trim();
      if (!containerId) throw adapterError('PROVIDER_ERROR');
      return inspectContainer({ providerAccountId: credentials.providerAccountId, accessToken: credentials.accessToken, containerId });
    }
  };
}
