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
  threads: Object.freeze({ label: 'Threads', min: 0, max: 1 }),
  tiktok: Object.freeze({ label: 'TikTok', min: 1, max: 1 })
});
const TIKTOK_PRIVACY_LEVELS = new Set([
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY'
]);

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

function normalizeProviderOptions(platform, value) {
  if (platform !== 'tiktok') return {};
  const options = value && typeof value === 'object' ? value : {};
  return {
    privacyLevel: String(options.privacyLevel ?? '').trim(),
    allowComment: options.allowComment === true,
    allowDuet: options.allowDuet === true,
    allowStitch: options.allowStitch === true,
    commercialContent: options.commercialContent === true,
    brandOrganic: options.brandOrganic === true,
    brandContent: options.brandContent === true,
    isAigc: options.isAigc === true,
    consent: options.consent === true
  };
}

function normalizeMedia(media) {
  if (!Array.isArray(media)) return [];
  return media.map((item) => ({
    type: String(item?.type ?? '').trim().toLowerCase(),
    url: String(item?.url ?? '').trim()
  }));
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
    normalized.push({
      platform,
      accountId,
      options: normalizeProviderOptions(platform, destination?.options),
      captionOverride: destination?.captionOverride === undefined || destination?.captionOverride === null
        ? null
        : String(destination.captionOverride).trim(),
      mediaOverride: destination?.mediaOverride === undefined || destination?.mediaOverride === null
        ? null
        : normalizeMedia(destination.mediaOverride)
    });
  }
  return normalized;
}

function validateProviderMediaCounts(requestedPlatforms, mediaCount, details, field = 'media') {
  for (const platform of new Set(requestedPlatforms)) {
    const contract = PROVIDER_MEDIA_CONTRACTS[platform];
    if (!contract || (mediaCount >= contract.min && mediaCount <= contract.max)) continue;
    const message = contract.min === 1 && contract.max === 1
      ? `${contract.label} currently requires exactly one media item.`
      : `${contract.label} currently supports at most one media item.`;
    details.push({ field, message });
  }
}

function validateDestinationOptions(destinations, details) {
  for (const destination of destinations) {
    if (destination.platform !== 'tiktok') continue;
    const options = destination.options ?? {};
    if (!TIKTOK_PRIVACY_LEVELS.has(options.privacyLevel)) {
      details.push({ field: 'destinations', message: 'TikTok requires a manually selected privacy level.' });
    }
    if (options.consent !== true) {
      details.push({ field: 'destinations', message: 'TikTok requires explicit posting and music-usage consent.' });
    }
    if (options.commercialContent && !options.brandOrganic && !options.brandContent) {
      details.push({ field: 'destinations', message: 'TikTok commercial content requires a disclosure type.' });
    }
  }
}

function validateMediaItems(media, details, field = 'media') {
  if (media.length > MAX_MEDIA) {
    details.push({ field, message: `A post can contain at most ${MAX_MEDIA} media items.` });
  }
  for (const item of media) {
    if (!MEDIA_TYPES.has(item.type)) {
      details.push({ field, message: `Unsupported media type: ${item.type || 'empty'}.` });
      break;
    }
    try {
      const url = new URL(item.url);
      if (url.protocol !== 'https:') throw new Error('not https');
    } catch {
      details.push({ field, message: 'Media URLs must be valid HTTPS URLs.' });
      break;
    }
  }
}

function effectiveCaption(baseCaption, destination) {
  return destination.captionOverride !== null && destination.captionOverride !== undefined
    ? destination.captionOverride
    : baseCaption;
}

function effectiveMedia(baseMedia, destination) {
  return destination.mediaOverride !== null && destination.mediaOverride !== undefined
    ? destination.mediaOverride
    : baseMedia;
}

function validateBaseInput(input, now, destinations, platforms, media) {
  const details = [];
  const caption = typeof input?.caption === 'string' ? input.caption.trim() : '';
  const scheduledMs = Date.parse(input?.scheduledAt ?? '');
  const usesDestinations = Array.isArray(input?.destinations);
  const requestedPlatforms = usesDestinations ? destinations.map((item) => item.platform) : platforms;

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

  validateMediaItems(media, details);

  if (usesDestinations) {
    for (const destination of destinations) {
      const destinationCaption = effectiveCaption(caption, destination);
      const destinationMedia = effectiveMedia(media, destination);
      if (!destinationCaption) {
        details.push({ field: 'destinations', message: `${destination.platform || 'Destination'} requires a caption.` });
      }
      validateMediaItems(destinationMedia, details, 'media');
      validateProviderMediaCounts([destination.platform], destinationMedia.length, details, 'media');
    }
    validateDestinationOptions(destinations, details);
  } else {
    if (!caption) details.push({ field: 'caption', message: 'Caption is required.' });
    validateProviderMediaCounts(requestedPlatforms, media.length, details);
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

export async function createScheduledPost(repository, input, { now = new Date(), allowLegacyPlatforms = false } = {}) {
  const destinations = normalizeDestinations(input?.destinations);
  const platforms = normalizePlatforms(input?.platforms);
  const mediaInput = normalizeMedia(input?.media);
  const validated = validateBaseInput(input, now, destinations, platforms, mediaInput);

  if (!validated.usesDestinations && allowLegacyPlatforms !== true) {
    throw new ValidationError([{
      field: 'destinations',
      message: 'Account-bound destinations are required. Legacy platforms-only scheduling is disabled.'
    }]);
  }

  const resolvedDestinations = validated.usesDestinations
    ? await validateDestinationAccounts(repository, destinations)
    : platforms.map((platform) => ({ platform, accountId: null, options: {}, captionOverride: null, mediaOverride: null }));
  const timestamp = now.toISOString();

  if (typeof repository?.createSocialScheduleGraph !== 'function') {
    throw new Error('ATOMIC_SOCIAL_SCHEDULING_REQUIRED');
  }

  return repository.createSocialScheduleGraph({
    post: {
      caption: validated.caption,
      scheduledAt: validated.scheduledAt,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    media: mediaInput.map((item, sortOrder) => ({
      type: item.type,
      url: item.url,
      sortOrder,
      metadata: {},
      createdAt: timestamp
    })),
    publicationPlans: resolvedDestinations.map((destination) => ({
      publication: {
        accountId: destination.accountId,
        platform: destination.platform,
        state: PUBLICATION_STATES.SCHEDULED,
        scheduledAt: validated.scheduledAt,
        providerOptions: destination.options ?? {},
        captionOverride: destination.captionOverride ?? null,
        mediaOverride: destination.mediaOverride ?? null,
        externalId: null,
        externalUrl: null,
        errorCode: null,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      job: {
        type: JOB_TYPES.SOCIAL_PUBLICATION,
        accountId: destination.accountId,
        state: JOB_STATES.SCHEDULED,
        scheduledAt: validated.scheduledAt,
        attempts: 0,
        lockedAt: null,
        lockedBy: null,
        errorCode: null,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    }))
  });
}

export async function listScheduledPosts(repository) {
  return repository.listPostsWithPublications();
}
