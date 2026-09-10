import { JOB_TYPES } from '../scheduler/job-types.js';
import { PUBLICATION_STATES } from '../scheduler/states.js';

export const SOCIAL_PLATFORMS = Object.freeze(['instagram', 'facebook', 'threads', 'tiktok']);
const SOCIAL_PLATFORM_SET = new Set(SOCIAL_PLATFORMS);

export class ValidationError extends Error {
  constructor(details) {
    super('Post validation failed');
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
    this.details = details;
  }
}

function normalizePlatforms(platforms) {
  if (!Array.isArray(platforms)) return [];
  return [...new Set(platforms.map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean))];
}

function validateInput(input, now) {
  const details = [];
  const caption = typeof input?.caption === 'string' ? input.caption.trim() : '';
  const platforms = normalizePlatforms(input?.platforms);
  const scheduledMs = Date.parse(input?.scheduledAt ?? '');

  if (!caption) details.push({ field: 'caption', message: 'Caption is required.' });
  if (platforms.length === 0) details.push({ field: 'platforms', message: 'Select at least one social platform.' });

  const unsupported = platforms.filter((platform) => !SOCIAL_PLATFORM_SET.has(platform));
  if (unsupported.length > 0) {
    details.push({ field: 'platforms', message: `Unsupported social platform: ${unsupported.join(', ')}` });
  }

  if (!Number.isFinite(scheduledMs)) {
    details.push({ field: 'scheduledAt', message: 'A valid schedule time is required.' });
  } else if (scheduledMs <= now.getTime()) {
    details.push({ field: 'scheduledAt', message: 'Schedule time must be in the future.' });
  }

  if (details.length > 0) throw new ValidationError(details);

  return { caption, platforms, scheduledAt: new Date(scheduledMs).toISOString() };
}

export async function createScheduledPost(repository, input, { now = new Date() } = {}) {
  const validated = validateInput(input, now);
  const timestamp = now.toISOString();

  const post = await repository.createPost({ caption: validated.caption, scheduledAt: validated.scheduledAt, createdAt: timestamp, updatedAt: timestamp });
  const publications = [];
  const jobs = [];

  for (const platform of validated.platforms) {
    const publication = await repository.createPublication({ postId: post.id, platform, state: PUBLICATION_STATES.SCHEDULED, scheduledAt: validated.scheduledAt, externalId: null, errorCode: null, createdAt: timestamp, updatedAt: timestamp });
    publications.push(publication);
    const job = await repository.createJob({ type: JOB_TYPES.SOCIAL_PUBLICATION, publicationId: publication.id, campaignId: null, state: PUBLICATION_STATES.SCHEDULED, scheduledAt: validated.scheduledAt, attempts: 0, lockedAt: null, lockedBy: null, createdAt: timestamp, updatedAt: timestamp });
    jobs.push(job);
  }

  return { post, publications, jobs };
}

export async function listScheduledPosts(repository) {
  return repository.listPostsWithPublications();
}
