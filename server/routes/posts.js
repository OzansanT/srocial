import { legacyPlatformSchedulingEnabled } from '../config/scheduling.js';
import { createScheduledPost, ValidationError } from '../services/post-service.js';
import {
  bulkCancelPostLifecycle,
  bulkReschedulePostLifecycle,
  cancelPostLifecycle,
  duplicatePostLifecycle,
  LifecycleError,
  listPostOperations,
  retryPublicationLifecycle,
  updatePostLifecycle
} from '../services/post-lifecycle-service.js';

function safeError(error) {
  if (error instanceof ValidationError || error?.code === 'VALIDATION_ERROR') {
    return { statusCode: 400, payload: { error: 'validation_error', details: error.details ?? [] } };
  }
  if (error instanceof LifecycleError || error?.code === 'NOT_FOUND' || error?.code === 'LIFECYCLE_CONFLICT') {
    if (error.code === 'NOT_FOUND') return { statusCode: 404, payload: { error: 'not_found' } };
    if (error.code === 'LIFECYCLE_CONFLICT') {
      return { statusCode: 409, payload: { error: 'lifecycle_conflict', reason: error.reason ?? 'state_conflict' } };
    }
  }
  return null;
}

async function lifecyclePayload(operation) {
  try { return await operation(); }
  catch (error) { return safeError(error) ?? Promise.reject(error); }
}

export async function createPostPayload(repository, input, { now, allowLegacyPlatforms = legacyPlatformSchedulingEnabled() } = {}) {
  try {
    const result = await createScheduledPost(repository, input, { now, allowLegacyPlatforms });
    return { statusCode: 201, payload: result };
  } catch (error) {
    return safeError(error) ?? Promise.reject(error);
  }
}

export async function listPostsPayload(repository, filters = {}) {
  return lifecyclePayload(async () => ({ statusCode: 200, payload: { posts: await listPostOperations(repository, filters) } }));
}

export function updatePostPayload(repository, postId, input, { now } = {}) {
  return lifecyclePayload(async () => ({ statusCode: 200, payload: { post: await updatePostLifecycle({ repository, postId, input, now }) } }));
}

export function cancelPostPayload(repository, postId, { now } = {}) {
  return lifecyclePayload(async () => ({ statusCode: 200, payload: { post: await cancelPostLifecycle({ repository, postId, now }) } }));
}

export function duplicatePostPayload(repository, postId, input, { now } = {}) {
  return lifecyclePayload(async () => ({ statusCode: 201, payload: await duplicatePostLifecycle({ repository, postId, input, now }) }));
}

export function retryPublicationPayload(repository, publicationId, input, { now } = {}) {
  return lifecyclePayload(async () => ({ statusCode: 200, payload: await retryPublicationLifecycle({ repository, publicationId, input, now }) }));
}

export function bulkCancelPostsPayload(repository, input, { now } = {}) {
  return lifecyclePayload(async () => ({
    statusCode: 200,
    payload: { posts: await bulkCancelPostLifecycle({ repository, postIds: input?.postIds, now }) }
  }));
}

export function bulkReschedulePostsPayload(repository, input, { now } = {}) {
  return lifecyclePayload(async () => ({
    statusCode: 200,
    payload: {
      posts: await bulkReschedulePostLifecycle({ repository, postIds: input?.postIds, scheduledAt: input?.scheduledAt, now })
    }
  }));
}
