import { JOB_TYPES } from '../scheduler/job-types.js';
import { PUBLICATION_STATES } from '../scheduler/states.js';
import { JOB_STATES } from '../scheduler/job-states.js';

export const SOCIAL_PLATFORMS = Object.freeze(['instagram', 'facebook', 'threads', 'tiktok']);
const SOCIAL_PLATFORM_SET = new Set(SOCIAL_PLATFORMS);
const MEDIA_TYPES = new Set(['image', 'video']);
const MAX_MEDIA = 10;
const PROVIDER_MEDIA_CONTRACTS = Object.freeze({
  instagram: Object.freeze({ label: 'Instagram', min: 1, max: 1 }),
  facebook: Object.freeze({ label: 'Facebook', min: 0, max: 1 }),
  threads: Object.freeze({ label: 'Threads', min: 0, max: 1 })
});

export class ValidationError extends Error {
  constructor(details) {
    super('Post validation failed');
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
    this.details = details;
  }
}

function normalizePlatform(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizePlatforms(platforms) {
  if (!Array.isArray(platforms)) return [];
  return [...new Set(platforms.map(normalizePlatform).filter(Boolean))];
}

function normalizeDestinations(destinations) {
  if (!Array.isArray(destinations)) return [];
  const seen = new Set();
  const normalized = [];
  for (const destination of destinations) {
    const platform = normalizePlatform(destination?.platform);
    const accountId = String(destination?.accountId ?? '').trim();
    if (!platform && !accountId) continue;
    const key = `${platform}:${accountId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ platform, accountId });
  }
  return normalized;
}

function normalizeMedia(media) {
  if (!Array.isArray(media)) return [];
  return media.map((item) => ({
    type: String(item?.type ?? '').trim().toLowerCase(),
    url: String(item?.url ?? '').trim()
  }));
}

function validateProviderMediaCounts(requestedPlatforms, mediaCount, details) {
  for (const platform of new Set(requestedPlatforms)) {
    const contract = PROVIDER_MEDIA_CONTRACTS[platform];
    if (!contract || (mediaCount >= contract.min && mediaCount <= contract.max)) continue;
    const message = contract.min === 1 && contract.max === 1
      ? `${contract.label} currently requires exactly one media item.`
      : `${contract.label} currently supports at most one media item.`;
    details.push({ field: 'media', message });
  }
}

function validateBaseInput(input, now, destinations, platforms, media) {
  const details = [];
  const caption = typeof input?.caption === 'string' ? input.caption.trim() : '';
  const scheduledMs = Date.parse(input?.scheduledAt ?? '');
  const usesDestinations = Array.isArray(input?.destinations);
  const requestedPlatforms = usesDestinations ? destinations.map((item) => item.platform) : platforms;

  if (!caption) details.push({ field: 'caption', message: 'Caption is required.' });
  if (requestedPlatforms.length === 0) {
    details.push({ field: usesDestinations ? 'destinations' : 'platforms', message: 'Select at least one social destination.' });
  }

  const unsupported = requestedPlatforms.filter((platform) => !SOCIAL_PLATFORM_SET.has(platform));
  if (unsupported.length > 0) {
    details.push({ field: usesDestinations ? 'destinations' : 'platforms', message: `Unsupported social platform: ${[...new Set(unsupported)].join(', ')}` });
  }

  if (!Number.isFinite(scheduledMs)) {
    details.push({ field: 'scheduledAt', message: 'A valid schedule time is required.' });
  } else if (scheduledMs <= now.getTime()) {
    details.push({ field: 'scheduledAt', message: 'Schedule time must be in the future.' });
  }

  if (media.length > MAX_MEDIA) {
    details.push({ field: 'media', message: `A post can contain at most ${MAX_MEDIA} media items.` });
  }
  validateProviderMediaCounts(requestedPlatforms, media.length, details);
  for (const item of media) {
    if (!MEDIA_TYPES.has(item.type)) {
      details.push({ field: 'media', message: `Unsupported media type: ${item.type || 'empty'}.` });
      break;
    }
    try {
      const url = new URL(item.url);
      if (url.protocol !== 'https:') throw new Error('not https');
    } catch {
      details.push({ field: 'media', message: 'Media URLs must be valid HTTPS URLs.' });
      break;
    }
  }

  if (details.length > 0) throw new ValidationError(details);
  return {
    caption,
    scheduledAt: new Date(scheduledMs).toISOString(),
    usesDestinations
  };
}

async function validateDestinationAccounts(repository, destinations) {
  const details = [];
  const validated = [];
  for (const destination of destinations) {
    if (!destination.accountId) {
      details.push({ field: 'destinations', message: `Select an account for ${destination.platform || 'the destination'}.` });
      continue;
    }
    const account = await repository.getAccount(destination.accountId);
    if (!account) {
      details.push({ field: 'destinations', message: `Account ${destination.accountId} was not found.` });
      continue;
    }
    if (account.state !== 'CONNECTED') {
      details.push({ field: 'destinations', message: `Account ${destination.accountId} is not connected.` });
      continue;
    }
    if (normalizePlatform(account.provider) !== destination.platform) {
      details.push({ field: 'destinations', message: `Account ${destination.accountId} does not belong to ${destination.platform}.` });
      continue;
    }
    validated.push(destination);
  }
  if (details.length > 0) throw new ValidationError(details);
  return validated;
}

export async function createScheduledPost(repository, input, { now = new Date() } = {}) {
  const destinations = normalizeDestinations(input?.destinations);
  const platforms = normalizePlatforms(input?.platforms);
  const mediaInput = normalizeMedia(input?.media);
  const validated = validateBaseInput(input, now, destinations, platforms, mediaInput);
  const resolvedDestinations = validated.usesDestinations
    ? await validateDestinationAccounts(repository, destinations)
    : platforms.map((platform) => ({ platform, accountId: null }));
  const timestamp = now.toISOString();

  const post = await repository.createPost({
    caption: validated.caption,
    scheduledAt: validated.scheduledAt,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  const media = [];
  for (const [sortOrder, item] of mediaInput.entries()) {
    media.push(await repository.createMedia({
      postId: post.id,
      type: item.type,
      url: item.url,
      sortOrder,
      metadata: {},
      createdAt: timestamp
    }));
  }

  const publications = [];
  const jobs = [];
  for (const destination of resolvedDestinations) {
    const publication = await repository.createPublication({
      postId: post.id,
      accountId: destination.accountId,
      platform: destination.platform,
      state: PUBLICATION_STATES.SCHEDULED,
      scheduledAt: validated.scheduledAt,
      externalId: null,
      errorCode: null,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    publications.push(publication);
    jobs.push(await repository.createJob({
      type: JOB_TYPES.SOCIAL_PUBLICATION,
      publicationId: publication.id,
      campaignId: null,
      accountId: destination.accountId,
      state: JOB_STATES.SCHEDULED,
      scheduledAt: validated.scheduledAt,
      attempts: 0,
      lockedAt: null,
      lockedBy: null,
      createdAt: timestamp,
      updatedAt: timestamp
    }));
  }

  return { post, media, publications, jobs };
}

export async function listScheduledPosts(repository) {
  return repository.listPostsWithPublications();
}
