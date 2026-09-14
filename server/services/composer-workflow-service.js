const SUPPORTED_PLATFORMS = new Set(['instagram', 'facebook', 'threads', 'tiktok']);
const CAPTION_LIMITS = Object.freeze({ instagram: 2200, facebook: 63206, threads: 500, tiktok: 2200 });
const MEDIA_RULES = Object.freeze({
  instagram: { min: 1, max: 1 },
  facebook: { min: 0, max: 1 },
  threads: { min: 0, max: 1 },
  tiktok: { min: 1, max: 1 }
});
const MEDIA_TYPES = new Set(['image', 'video']);

function workflowError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertObject(value, label = 'payload') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw workflowError('WORKFLOW_VALIDATION_ERROR', `${label} must be an object`);
  }
}

function normalizeName(value, { fallback = 'Untitled draft' } = {}) {
  const name = String(value ?? '').trim() || fallback;
  if (name.length > 200) throw workflowError('WORKFLOW_VALIDATION_ERROR', 'name is too long');
  return name;
}

function normalizeCaption(value) {
  const caption = String(value ?? '');
  if (caption.length > 10000) throw workflowError('WORKFLOW_VALIDATION_ERROR', 'caption is too long');
  return caption;
}

function normalizeScheduledAt(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw workflowError('WORKFLOW_VALIDATION_ERROR', 'scheduledAt is invalid');
  return date.toISOString();
}

function normalizeMedia(items, { permissive = true } = {}) {
  if (items === undefined || items === null) return [];
  if (!Array.isArray(items)) throw workflowError('WORKFLOW_VALIDATION_ERROR', 'media must be an array');
  if (items.length > 10) throw workflowError('WORKFLOW_VALIDATION_ERROR', 'media has too many items');
  return items.map((item) => {
    assertObject(item, 'media item');
    const type = String(item.type ?? '').trim().toLowerCase();
    const url = String(item.url ?? '').trim();
    if (!permissive && !MEDIA_TYPES.has(type)) throw workflowError('WORKFLOW_VALIDATION_ERROR', 'unsupported media type');
    if (type && !MEDIA_TYPES.has(type)) throw workflowError('WORKFLOW_VALIDATION_ERROR', 'unsupported media type');
    return { type, url };
  });
}

function normalizeDestination(item, { permissive = true } = {}) {
  assertObject(item, 'destination');
  const platform = String(item.platform ?? '').trim().toLowerCase();
  const accountId = String(item.accountId ?? '').trim();
  if (platform && !SUPPORTED_PLATFORMS.has(platform)) throw workflowError('WORKFLOW_VALIDATION_ERROR', 'unsupported platform');
  if (!permissive && (!platform || !accountId)) throw workflowError('WORKFLOW_VALIDATION_ERROR', 'destination is incomplete');
  const destination = { platform, accountId };
  if (Object.prototype.hasOwnProperty.call(item, 'options')) destination.options = structuredClone(item.options ?? {});
  if (Object.prototype.hasOwnProperty.call(item, 'captionOverride')) {
    destination.captionOverride = item.captionOverride === null ? null : normalizeCaption(item.captionOverride);
  }
  if (Object.prototype.hasOwnProperty.call(item, 'mediaOverride')) {
    destination.mediaOverride = item.mediaOverride === null ? null : normalizeMedia(item.mediaOverride, { permissive });
  }
  return destination;
}

function normalizeDestinations(items, options) {
  if (items === undefined || items === null) return [];
  if (!Array.isArray(items)) throw workflowError('WORKFLOW_VALIDATION_ERROR', 'destinations must be an array');
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const destination = normalizeDestination(item, options);
    const key = `${destination.platform}:${destination.accountId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(destination);
  }
  return result;
}

function normalizePlatformOverrides(value) {
  if (value === undefined || value === null) return {};
  assertObject(value, 'platformOverrides');
  const result = {};
  for (const [platformValue, override] of Object.entries(value)) {
    const platform = String(platformValue).trim().toLowerCase();
    if (!SUPPORTED_PLATFORMS.has(platform)) throw workflowError('WORKFLOW_VALIDATION_ERROR', 'unsupported platform override');
    assertObject(override, 'platform override');
    result[platform] = {};
    if (Object.prototype.hasOwnProperty.call(override, 'caption')) result[platform].caption = normalizeCaption(override.caption);
    if (Object.prototype.hasOwnProperty.call(override, 'media')) result[platform].media = normalizeMedia(override.media, { permissive: true });
  }
  return result;
}

function normalizeDraft(input, { existing = null } = {}) {
  assertObject(input);
  return {
    name: Object.prototype.hasOwnProperty.call(input, 'name') ? normalizeName(input.name) : existing?.name ?? 'Untitled draft',
    caption: Object.prototype.hasOwnProperty.call(input, 'caption') ? normalizeCaption(input.caption) : existing?.caption ?? '',
    scheduledAt: Object.prototype.hasOwnProperty.call(input, 'scheduledAt') ? normalizeScheduledAt(input.scheduledAt) : existing?.scheduledAt ?? null,
    media: Object.prototype.hasOwnProperty.call(input, 'media') ? normalizeMedia(input.media, { permissive: true }) : existing?.media ?? [],
    destinations: Object.prototype.hasOwnProperty.call(input, 'destinations') ? normalizeDestinations(input.destinations, { permissive: true }) : existing?.destinations ?? [],
    platformOverrides: Object.prototype.hasOwnProperty.call(input, 'platformOverrides') ? normalizePlatformOverrides(input.platformOverrides) : existing?.platformOverrides ?? {}
  };
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) throw workflowError('WORKFLOW_VALIDATION_ERROR', 'tags must be an array');
  const seen = new Set();
  const result = [];
  for (const raw of tags) {
    const body = String(raw ?? '').trim().replace(/^#+/, '').replace(/\s+/g, '');
    if (!body) continue;
    const tag = `#${body}`;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  if (result.length > 100) throw workflowError('WORKFLOW_VALIDATION_ERROR', 'too many hashtags');
  return result;
}

function normalizeResourceName(value) {
  const name = String(value ?? '').trim();
  if (!name || name.length > 200) throw workflowError('WORKFLOW_VALIDATION_ERROR', 'resource name is required');
  return name;
}

function effectiveContent(input, destination) {
  const platformOverride = input.platformOverrides?.[destination.platform] ?? {};
  const hasDestinationCaption = destination.captionOverride !== null && destination.captionOverride !== undefined;
  const hasPlatformCaption = Object.prototype.hasOwnProperty.call(platformOverride, 'caption');
  const hasDestinationMedia = destination.mediaOverride !== null && destination.mediaOverride !== undefined;
  const hasPlatformMedia = Object.prototype.hasOwnProperty.call(platformOverride, 'media');
  return {
    caption: hasDestinationCaption ? destination.captionOverride : hasPlatformCaption ? platformOverride.caption : input.caption,
    media: hasDestinationMedia ? destination.mediaOverride : hasPlatformMedia ? platformOverride.media : input.media
  };
}

function validateMediaForReport(media, platform, issues) {
  const rule = MEDIA_RULES[platform];
  if (!rule) return;
  if (media.length < rule.min || media.length > rule.max) {
    issues.push({ code: 'MEDIA_COUNT_UNSUPPORTED', message: `${platform} expects ${rule.min === rule.max ? rule.min : `${rule.min}-${rule.max}`} media item(s)` });
  }
  for (const item of media) {
    if (!MEDIA_TYPES.has(item.type)) issues.push({ code: 'MEDIA_TYPE_UNSUPPORTED', message: 'Media type is unsupported' });
    try {
      const url = new URL(item.url);
      if (url.protocol !== 'https:') issues.push({ code: 'MEDIA_HTTPS_REQUIRED', message: 'Media URL must use HTTPS' });
    } catch {
      issues.push({ code: 'MEDIA_URL_INVALID', message: 'Media URL is invalid' });
    }
  }
}

export function createComposerWorkflowService({ repository }) {
  if (!repository) throw new TypeError('repository is required');

  return {
    async createDraft(input, { now = new Date() } = {}) {
      const normalized = normalizeDraft(input);
      const timestamp = now.toISOString();
      return repository.createDraft({ ...normalized, revision: 1, createdAt: timestamp, updatedAt: timestamp });
    },
    listDrafts() { return repository.listDrafts(); },
    async getDraft(id) {
      const draft = await repository.getDraft(id);
      if (!draft) throw workflowError('DRAFT_NOT_FOUND');
      return draft;
    },
    async updateDraft(id, input, { now = new Date() } = {}) {
      assertObject(input);
      const revision = Number(input.revision);
      if (!Number.isInteger(revision) || revision < 1) throw workflowError('WORKFLOW_VALIDATION_ERROR', 'revision is required');
      const existing = await repository.getDraft(id);
      if (!existing) throw workflowError('DRAFT_NOT_FOUND');
      const normalized = normalizeDraft(input, { existing });
      try {
        const updated = await repository.updateDraft(id, { ...normalized, updatedAt: now.toISOString() }, revision);
        if (!updated) throw workflowError('DRAFT_NOT_FOUND');
        return updated;
      } catch (error) {
        if (error?.code === 'DRAFT_REVISION_CONFLICT') throw workflowError('DRAFT_REVISION_CONFLICT');
        throw error;
      }
    },
    async deleteDraft(id) {
      const removed = await repository.deleteDraft(id);
      if (!removed) throw workflowError('DRAFT_NOT_FOUND');
    },
    async createCaptionTemplate(input, { now = new Date() } = {}) {
      assertObject(input);
      const timestamp = now.toISOString();
      return repository.createCaptionTemplate({
        name: normalizeResourceName(input.name), caption: normalizeCaption(input.caption), createdAt: timestamp, updatedAt: timestamp
      });
    },
    listCaptionTemplates() { return repository.listCaptionTemplates(); },
    async deleteCaptionTemplate(id) {
      if (!await repository.deleteCaptionTemplate(id)) throw workflowError('WORKFLOW_RESOURCE_NOT_FOUND');
    },
    async createHashtagCollection(input, { now = new Date() } = {}) {
      assertObject(input);
      const timestamp = now.toISOString();
      return repository.createHashtagCollection({
        name: normalizeResourceName(input.name), tags: normalizeTags(input.tags ?? []), createdAt: timestamp, updatedAt: timestamp
      });
    },
    listHashtagCollections() { return repository.listHashtagCollections(); },
    async deleteHashtagCollection(id) {
      if (!await repository.deleteHashtagCollection(id)) throw workflowError('WORKFLOW_RESOURCE_NOT_FOUND');
    },
    async createDestinationGroup(input, { now = new Date() } = {}) {
      assertObject(input);
      const timestamp = now.toISOString();
      return repository.createDestinationGroup({
        name: normalizeResourceName(input.name),
        destinations: normalizeDestinations(input.destinations ?? [], { permissive: false }).map(({ platform, accountId }) => ({ platform, accountId })),
        createdAt: timestamp,
        updatedAt: timestamp
      });
    },
    listDestinationGroups() { return repository.listDestinationGroups(); },
    async deleteDestinationGroup(id) {
      if (!await repository.deleteDestinationGroup(id)) throw workflowError('WORKFLOW_RESOURCE_NOT_FOUND');
    },
    async compatibility(input, { now = new Date() } = {}) {
      assertObject(input);
      const normalized = {
        caption: normalizeCaption(input.caption),
        scheduledAt: normalizeScheduledAt(input.scheduledAt),
        media: normalizeMedia(input.media, { permissive: true }),
        destinations: normalizeDestinations(input.destinations, { permissive: true }),
        platformOverrides: normalizePlatformOverrides(input.platformOverrides)
      };
      const results = [];
      for (const destination of normalized.destinations) {
        const issues = [];
        if (!destination.platform || !SUPPORTED_PLATFORMS.has(destination.platform)) {
          issues.push({ code: 'PLATFORM_UNSUPPORTED', message: 'Destination platform is unsupported' });
        }
        if (!destination.accountId) {
          issues.push({ code: 'ACCOUNT_REQUIRED', message: 'Connected account is required' });
        } else {
          const account = await repository.getAccount(destination.accountId);
          if (!account) issues.push({ code: 'ACCOUNT_NOT_FOUND', message: 'Connected account was not found' });
          else if (account.state !== 'CONNECTED') issues.push({ code: 'ACCOUNT_NOT_CONNECTED', message: 'Account is not connected' });
          else if (account.provider !== destination.platform) issues.push({ code: 'ACCOUNT_PLATFORM_MISMATCH', message: 'Account does not match destination platform' });
        }
        const effective = effectiveContent(normalized, destination);
        const captionLength = String(effective.caption ?? '').length;
        const captionLimit = CAPTION_LIMITS[destination.platform] ?? null;
        if (!String(effective.caption ?? '').trim()) issues.push({ code: 'CAPTION_REQUIRED', message: 'Caption is required' });
        if (captionLimit !== null && captionLength > captionLimit) issues.push({ code: 'CAPTION_TOO_LONG', message: `Caption exceeds ${captionLimit} characters` });
        validateMediaForReport(effective.media, destination.platform, issues);
        if (destination.platform === 'tiktok') {
          const options = destination.options ?? {};
          if (!String(options.privacyLevel ?? '').trim()) issues.push({ code: 'TIKTOK_PRIVACY_REQUIRED', message: 'TikTok privacy must be selected' });
          if (options.consent !== true) issues.push({ code: 'TIKTOK_CONSENT_REQUIRED', message: 'TikTok publishing consent is required' });
        }
        if (!normalized.scheduledAt || Date.parse(normalized.scheduledAt) <= now.getTime()) {
          issues.push({ code: 'FUTURE_SCHEDULE_REQUIRED', message: 'Publish time must be in the future' });
        }
        results.push({
          platform: destination.platform,
          accountId: destination.accountId,
          captionLength,
          captionLimit,
          remainingCharacters: captionLimit === null ? null : captionLimit - captionLength,
          compatible: issues.length === 0,
          issues
        });
      }
      return { compatible: results.length > 0 && results.every((item) => item.compatible), destinations: results };
    }
  };
}