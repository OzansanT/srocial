import { createScheduledPost, listScheduledPosts, ValidationError } from '../services/post-service.js';

export async function createPostPayload(repository, input, { now } = {}) {
  try {
    const result = await createScheduledPost(repository, input, { now });
    return { statusCode: 201, payload: result };
  } catch (error) {
    if (error instanceof ValidationError || error?.code === 'VALIDATION_ERROR') {
      return { statusCode: 400, payload: { error: 'validation_error', details: error.details ?? [] } };
    }
    throw error;
  }
}

export async function listPostsPayload(repository) {
  return { statusCode: 200, payload: { posts: await listScheduledPosts(repository) } };
}
