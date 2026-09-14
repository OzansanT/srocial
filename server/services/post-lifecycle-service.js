import { createScheduledPost, ValidationError } from './post-service.js';
import { JOB_TYPES } from '../scheduler/job-types.js';

const FAILED_PUBLICATION_STATES = new Set(['FAILED', 'API_ERROR', 'MEDIA_ERROR', 'AUTH_ERROR', 'RATE_LIMITED']);
const RETRYABLE_JOB_STATES = new Set(['FAILED', 'COMPLETED', 'CANCELLED']);
const CANCELLABLE_PUBLICATION_STATES = new Set(['SCHEDULED', 'RETRYING']);
const CANCELLABLE_JOB_STATES = new Set(['SCHEDULED', 'RETRYING']);

export class LifecycleError extends Error {
  constructor(code, reason) {
    super(reason);
    this.name = 'LifecycleError';
    this.code = code;
    this.reason = reason;
  }
}

function validation(details) {
  throw new ValidationError(details);
}

function conflict(reason) {
  throw new LifecycleError('LIFECYCLE_CONFLICT', reason);
}

function notFound(reason = 'not_found') {
  throw new LifecycleError('NOT_FOUND', reason);
}

function normalizeIdList(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean))];
}

function parseFuture(value, now, field = 'scheduledAt') {
  const ms = Date.parse(value ?? '');
  if (!Number.isFinite(ms) || ms <= now.getTime()) {
    validation([{ field, message: 'Schedule must be a valid future time.' }]);
  }
  return new Date(ms).toISOString();
}

function parseOptionalBoundary(value, field) {
  if (value == null || value === '') return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) validation([{ field, message: `${field} must be a valid date/time.` }]);
  return ms;
}

function socialJobs(publication) {
  return (Array.isArray(publication?.jobs) ? publication.jobs : [])
    .filter((job) => job.type === JOB_TYPES.SOCIAL_PUBLICATION || job.type === JOB_TYPES.RETRY_PUBLICATION);
}

function publicationExpected(publication) {
  return { state: publication.state, externalId: publication.externalId ?? null };
}

function jobExpected(job) {
  return { state: job.state };
}

function ensureEditable(post) {
  if (!post?.publications?.length) conflict('publication_missing');
  for (const publication of post.publications) {
    if (publication.state !== 'SCHEDULED') conflict('post_already_started');
    const jobs = socialJobs(publication);
    if (!jobs.length) conflict('job_missing');
    if (jobs.some((job) => job.state === 'RUNNING')) conflict('job_running');
    if (jobs.some((job) => job.state !== 'SCHEDULED')) conflict('post_already_started');
  }
}

function ensureCancellable(post) {
  if (!post?.publications?.length) conflict('publication_missing');
  for (const publication of post.publications) {
    if (publication.externalId) conflict('unsafe_external_id');
    if (!CANCELLABLE_PUBLICATION_STATES.has(publication.state)) conflict('post_already_started');
    const jobs = socialJobs(publication);
    if (!jobs.length) conflict('job_missing');
    if (jobs.some((job) => job.state === 'RUNNING')) conflict('job_running');
    if (jobs.some((job) => !CANCELLABLE_JOB_STATES.has(job.state))) conflict('post_already_started');
  }
}

function editMutation(post, input, now) {
  ensureEditable(post);
  const hasCaption = Object.prototype.hasOwnProperty.call(input ?? {}, 'caption');
  const hasSchedule = Object.prototype.hasOwnProperty.call(input ?? {}, 'scheduledAt');
  if (!hasCaption && !hasSchedule) validation([{ field: 'post', message: 'Caption or schedule change is required.' }]);

  const timestamp = now.toISOString();
  const postPatch = { updatedAt: timestamp };
  let scheduledAt = null;
  if (hasCaption) {
    const caption = typeof input.caption === 'string' ? input.caption.trim() : '';
    if (!caption) validation([{ field: 'caption', message: 'Caption is required.' }]);
    postPatch.caption = caption;
  }
  if (hasSchedule) {
    scheduledAt = parseFuture(input.scheduledAt, now);
    postPatch.scheduledAt = scheduledAt;
  }

  const publicationPatches = [];
  const jobPatches = [];
  for (const publication of post.publications) {
    publicationPatches.push({
      id: publication.id,
      expected: publicationExpected(publication),
      patch: scheduledAt ? { scheduledAt, updatedAt: timestamp } : {}
    });
    for (const job of socialJobs(publication)) {
      jobPatches.push({
        id: job.id,
        expected: jobExpected(job),
        patch: scheduledAt ? { scheduledAt, updatedAt: timestamp } : {}
      });
    }
  }
  return { postId: post.id, postPatch, publicationPatches, jobPatches };
}

function cancelMutation(post, now) {
  ensureCancellable(post);
  const timestamp = now.toISOString();
  return {
    postId: post.id,
    postPatch: { updatedAt: timestamp },
    publicationPatches: post.publications.map((publication) => ({
      id: publication.id,
      expected: publicationExpected(publication),
      patch: { state: 'CANCELLED', updatedAt: timestamp }
    })),
    jobPatches: post.publications.flatMap((publication) => socialJobs(publication).map((job) => ({
      id: job.id,
      expected: jobExpected(job),
      patch: { state: 'CANCELLED', lockedAt: null, lockedBy: null, updatedAt: timestamp }
    })))
  };
}

async function allOperations(repository) {
  if (typeof repository?.listPostOperations !== 'function') throw new Error('POST_OPERATION_READ_MODEL_REQUIRED');
  return repository.listPostOperations();
}

async function postOperation(repository, postId) {
  const id = String(postId ?? '').trim();
  if (!id) notFound();
  if (typeof repository?.getPostOperation === 'function') {
    const value = await repository.getPostOperation(id);
    if (!value) notFound();
    return value;
  }
  const post = (await allOperations(repository)).find((item) => item.id === id);
  if (!post) notFound();
  return post;
}

async function publicationOperation(repository, publicationId) {
  const id = String(publicationId ?? '').trim();
  if (!id) notFound();
  if (typeof repository?.getPublicationOperation === 'function') {
    const value = await repository.getPublicationOperation(id);
    if (!value) notFound();
    return value;
  }
  for (const post of await allOperations(repository)) {
    const publication = post.publications?.find((item) => item.id === id);
    if (publication) return { post, publication };
  }
  notFound();
}

async function apply(repository, mutations) {
  if (typeof repository?.applyPostLifecycleMutations !== 'function') throw new Error('ATOMIC_LIFECYCLE_MUTATION_REQUIRED');
  try {
    return await repository.applyPostLifecycleMutations({ mutations });
  } catch (error) {
    if (error?.code === 'LIFECYCLE_STALE_STATE') conflict('stale_state');
    throw error;
  }
}

export async function listPostOperations(repository, filters = {}) {
  const platform = String(filters.platform ?? '').trim().toLowerCase();
  const accountId = String(filters.accountId ?? '').trim();
  const state = String(filters.state ?? '').trim().toUpperCase();
  const fromMs = parseOptionalBoundary(filters.from, 'from');
  const untilMs = parseOptionalBoundary(filters.until, 'until');
  if (fromMs != null && untilMs != null && fromMs > untilMs) {
    validation([{ field: 'until', message: 'until must be after from.' }]);
  }

  return (await allOperations(repository)).filter((post) => {
    const scheduledMs = Date.parse(post.scheduledAt ?? '');
    if (fromMs != null && (!Number.isFinite(scheduledMs) || scheduledMs < fromMs)) return false;
    if (untilMs != null && (!Number.isFinite(scheduledMs) || scheduledMs >= untilMs)) return false;
    const publications = Array.isArray(post.publications) ? post.publications : [];
    return publications.some((publication) => {
      if (platform && String(publication.platform ?? '').toLowerCase() !== platform) return false;
      if (accountId && String(publication.accountId ?? '') !== accountId) return false;
      if (state && String(publication.state ?? '').toUpperCase() !== state) return false;
      return true;
    });
  });
}

export async function updatePostLifecycle({ repository, postId, input = {}, now = new Date() } = {}) {
  const post = await postOperation(repository, postId);
  const results = await apply(repository, [editMutation(post, input, now)]);
  return results[0];
}

export async function cancelPostLifecycle({ repository, postId, now = new Date() } = {}) {
  const post = await postOperation(repository, postId);
  const results = await apply(repository, [cancelMutation(post, now)]);
  return results[0];
}

export async function retryPublicationLifecycle({ repository, publicationId, input = {}, now = new Date() } = {}) {
  const { post, publication } = await publicationOperation(repository, publicationId);
  if (!FAILED_PUBLICATION_STATES.has(String(publication.state ?? '').toUpperCase())) conflict('not_failed');
  if (publication.externalId) conflict('unsafe_external_id');
  const jobs = socialJobs(publication);
  if (jobs.some((job) => job.state === 'RUNNING')) conflict('job_running');
  const job = [...jobs].reverse().find((candidate) => RETRYABLE_JOB_STATES.has(candidate.state));
  if (!job) conflict('job_not_retryable');

  const scheduledAt = Object.prototype.hasOwnProperty.call(input, 'scheduledAt')
    ? parseFuture(input.scheduledAt, now)
    : new Date(now.getTime() + 60_000).toISOString();
  const timestamp = now.toISOString();
  const results = await apply(repository, [{
    postId: post.id,
    postPatch: { updatedAt: timestamp },
    publicationPatches: [{
      id: publication.id,
      expected: publicationExpected(publication),
      patch: { state: 'SCHEDULED', scheduledAt, errorCode: null, updatedAt: timestamp }
    }],
    jobPatches: [{
      id: job.id,
      expected: jobExpected(job),
      patch: { state: 'SCHEDULED', scheduledAt, attempts: 0, lockedAt: null, lockedBy: null, errorCode: null, updatedAt: timestamp }
    }]
  }]);
  const updated = results[0];
  return { post: updated, publication: updated.publications.find((item) => item.id === publication.id) };
}

export async function duplicatePostLifecycle({ repository, postId, input = {}, now = new Date() } = {}) {
  const source = await postOperation(repository, postId);
  const scheduledAt = parseFuture(input.scheduledAt, now);
  const media = (source.media ?? []).map(({ type, url }) => ({ type, url }));
  const publications = source.publications ?? [];
  if (!publications.length) conflict('publication_missing');
  const allBound = publications.every((publication) => publication.accountId);
  const allUnbound = publications.every((publication) => !publication.accountId);
  if (!allBound && !allUnbound) conflict('mixed_binding');

  const request = { caption: source.caption, media, scheduledAt };
  if (allBound) {
    request.destinations = publications.map((publication) => ({
      platform: publication.platform,
      accountId: publication.accountId,
      options: publication.providerOptions ?? {}
    }));
  } else {
    request.platforms = publications.map((publication) => publication.platform);
  }
  return createScheduledPost(repository, request, { now });
}

export async function bulkCancelPostLifecycle({ repository, postIds, now = new Date() } = {}) {
  const ids = normalizeIdList(postIds);
  if (!ids.length) validation([{ field: 'postIds', message: 'Select at least one post.' }]);
  const mutations = [];
  for (const id of ids) mutations.push(cancelMutation(await postOperation(repository, id), now));
  return apply(repository, mutations);
}

export async function bulkReschedulePostLifecycle({ repository, postIds, scheduledAt, now = new Date() } = {}) {
  const ids = normalizeIdList(postIds);
  if (!ids.length) validation([{ field: 'postIds', message: 'Select at least one post.' }]);
  const normalizedSchedule = parseFuture(scheduledAt, now);
  const mutations = [];
  for (const id of ids) mutations.push(editMutation(await postOperation(repository, id), { scheduledAt: normalizedSchedule }, now));
  return apply(repository, mutations);
}
