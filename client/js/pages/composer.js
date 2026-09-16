import { createPost } from '../api/posts-api.js';
import { getTikTokCreatorInfo, listAccounts } from '../api/accounts-api.js';
import { uploadMedia, describeUploadedMedia } from '../api/media-api.js';

const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'threads', 'tiktok'];
const MAX_COMPOSER_MEDIA = 10;
const UPLOAD_ERRORS = Object.freeze({
  unsupported_media_type: 'Choose a JPEG, PNG, WebP, or MP4 file.',
  media_too_large: 'This file is too large for the server upload limit.',
  media_storage_quota_exceeded: 'Media storage is full. Delete unused files from the Media Library or increase the storage quota.',
  empty_media: 'This file is empty. Choose another file.',
  media_storage_unavailable: 'Media uploads are currently unavailable.'
});

function setDefaultSchedule(input) {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  input.value = local;
  input.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function localDateTimeValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function notifyComposerInput(form) {
  if (typeof form?.dispatchEvent !== 'function') return;
  form.dispatchEvent(new Event('input', { bubbles: true }));
}

function formatError(error) {
  const details = error?.payload?.details;
  if (Array.isArray(details) && details.length) return details.map((item) => item.message).join(' ');
  if (error?.payload?.error) return `Unable to schedule: ${error.payload.error}.`;
  return error?.message || 'Unable to schedule this post.';
}

function connectedAccount(accounts, platform, accountId) {
  return accounts.find((account) => account.id === accountId && account.provider === platform && account.state === 'CONNECTED');
}

function checked(formData, name) {
  return formData.get(name) != null;
}

function buildTikTokOptions(formData, { permissive = false } = {}) {
  const privacyLevel = String(formData.get('tiktok:privacyLevel') ?? '').trim();
  const consent = checked(formData, 'tiktok:consent');
  const commercialContent = checked(formData, 'tiktok:commercialContent');
  const brandOrganic = checked(formData, 'tiktok:brandOrganic');
  const brandContent = checked(formData, 'tiktok:brandContent');
  if (!permissive) {
    if (!privacyLevel) throw new Error('TikTok requires you to select a privacy level.');
    if (!consent) throw new Error('TikTok requires posting and music-usage consent.');
    if (commercialContent && !brandOrganic && !brandContent) {
      throw new Error('TikTok commercial content requires a disclosure type.');
    }
  }
  return {
    privacyLevel,
    allowComment: checked(formData, 'tiktok:allowComment'),
    allowDuet: checked(formData, 'tiktok:allowDuet'),
    allowStitch: checked(formData, 'tiktok:allowStitch'),
    commercialContent,
    brandOrganic,
    brandContent,
    isAigc: checked(formData, 'tiktok:isAigc'),
    consent
  };
}

function applyDestinationOverrides(formData, platform, destination) {
  const caption = String(formData.get(`override:${platform}:caption`) ?? '').trim();
  const mediaMode = String(formData.get(`override:${platform}:mediaMode`) ?? 'inherit');
  if (caption) destination.captionOverride = caption;
  if (mediaMode === 'none') destination.mediaOverride = [];
  if (mediaMode === 'custom') {
    const url = String(formData.get(`override:${platform}:mediaUrl`) ?? '').trim();
    const type = String(formData.get(`override:${platform}:mediaType`) ?? 'image').trim().toLowerCase();
    destination.mediaOverride = url ? [{ type, url }] : [];
  }
  return destination;
}

function buildDestinations(formData, accounts, { strict = true } = {}) {
  const platforms = formData.getAll('platform').map((value) => String(value).trim().toLowerCase()).filter(Boolean);
  return platforms.map((platform) => {
    const accountId = String(formData.get(`account:${platform}`) ?? '').trim();
    if (strict && !connectedAccount(accounts, platform, accountId)) {
      throw new Error(`Select a connected account for ${platform}.`);
    }
    const destination = platform === 'tiktok'
      ? { platform, accountId, options: buildTikTokOptions(formData, { permissive: !strict }) }
      : { platform, accountId };
    return applyDestinationOverrides(formData, platform, destination);
  });
}

function values(formData, name) {
  if (typeof formData?.getAll === 'function') return formData.getAll(name);
  const value = formData?.get?.(name);
  return value == null ? [] : [value];
}

function baseMedia(formData) {
  const urls = values(formData, 'mediaUrl');
  const types = values(formData, 'mediaType');
  const media = urls.map((value, index) => ({
    type: String(types[index] ?? 'image').trim().toLowerCase() || 'image',
    url: String(value ?? '').trim()
  })).filter((item) => item.url);
  if (media.length > MAX_COMPOSER_MEDIA) throw new Error(`A post can contain at most ${MAX_COMPOSER_MEDIA} media items.`);
  return media;
}

export function buildComposerPayload({ formData, accounts = [] }) {
  const destinations = buildDestinations(formData, accounts, { strict: true });
  const scheduledAtValue = String(formData.get('scheduledAt') ?? '');
  const localDate = new Date(scheduledAtValue);
  if (!Number.isFinite(localDate.getTime())) throw new Error('Select a valid publish time.');
  return {
    caption: String(formData.get('caption') ?? ''),
    destinations,
    media: baseMedia(formData),
    scheduledAt: localDate.toISOString()
  };
}

function buildPermissiveState(form, accounts) {
  const formData = new FormData(form);
  const scheduledAtValue = String(formData.get('scheduledAt') ?? '');
  const localDate = new Date(scheduledAtValue);
  return {
    caption: String(formData.get('caption') ?? ''),
    destinations: buildDestinations(formData, accounts, { strict: false }),
    media: baseMedia(formData),
    scheduledAt: Number.isFinite(localDate.getTime()) ? localDate.toISOString() : null,
    platformOverrides: {}
  };
}

function readMediaRows(container) {
  if (!container?.querySelectorAll) return [];
  return [...container.querySelectorAll('[data-composer-media-row]')].map((row) => ({
    type: String(row.querySelector('[name="mediaType"]')?.value ?? 'image').trim().toLowerCase() || 'image',
    url: String(row.querySelector('[name="mediaUrl"]')?.value ?? '').trim()
  })).filter((item) => item.url);
}

function createMediaRow(item = {}, onRemove) {
  const row = document.createElement('div');
  row.className = 'media-grid';
  row.dataset.composerMediaRow = '';

  const typeLabel = document.createElement('label');
  typeLabel.className = 'field';
  const typeText = document.createElement('span');
  typeText.textContent = 'Media type';
  const type = document.createElement('select');
  type.name = 'mediaType';
  for (const [value, label] of [['image', 'Image'], ['video', 'Video / Reel']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    type.append(option);
  }
  type.value = String(item.type ?? 'image').toLowerCase() === 'video' ? 'video' : 'image';
  typeLabel.append(typeText, type);

  const urlLabel = document.createElement('label');
  urlLabel.className = 'field';
  const urlText = document.createElement('span');
  urlText.textContent = 'Media URL';
  const url = document.createElement('input');
  url.name = 'mediaUrl';
  url.type = 'url';
  url.inputMode = 'url';
  url.placeholder = 'https://cdn.example.com/post.jpg';
  url.value = String(item.url ?? '');
  urlLabel.append(urlText, url);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'button button--secondary';
  remove.dataset.removeMedia = '';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => onRemove?.(row));
  row.append(typeLabel, urlLabel, remove);
  return row;
}

function syncMediaRows(container, countTarget, addButton) {
  if (!container?.querySelectorAll) return;
  const rows = [...container.querySelectorAll('[data-composer-media-row]')];
  rows.forEach((row, index) => {
    const type = row.querySelector('[name="mediaType"]');
    const url = row.querySelector('[name="mediaUrl"]');
    if (type) type.id = index === 0 ? 'media-type' : `media-type-${index + 1}`;
    if (url) url.id = index === 0 ? 'media-url' : `media-url-${index + 1}`;
    const remove = row.querySelector('[data-remove-media]');
    if (remove) remove.disabled = rows.length === 1;
  });
  if (countTarget) countTarget.textContent = `${rows.length}/${MAX_COMPOSER_MEDIA} media items`;
  if (addButton) addButton.disabled = rows.length >= MAX_COMPOSER_MEDIA;
}

function replaceMediaRows(container, media = [], countTarget, addButton) {
  if (!container?.replaceChildren) return false;
  const items = Array.isArray(media) && media.length ? media.slice(0, MAX_COMPOSER_MEDIA) : [{}];
  const removeRow = (row) => {
    if (container.querySelectorAll('[data-composer-media-row]').length <= 1) return;
    row.remove();
    syncMediaRows(container, countTarget, addButton);
  };
  container.replaceChildren(...items.map((item) => createMediaRow(item, removeRow)));
  syncMediaRows(container, countTarget, addButton);
  return true;
}

function appendMediaToRows(container, item, countTarget, addButton) {
  if (!container?.querySelectorAll) return false;
  const normalizedType = String(item?.type ?? '').trim().toLowerCase();
  const normalizedUrl = String(item?.url ?? '').trim();
  if (!['image', 'video'].includes(normalizedType) || !normalizedUrl) return false;
  const rows = [...container.querySelectorAll('[data-composer-media-row]')];
  const blank = rows.find((row) => !String(row.querySelector('[name="mediaUrl"]')?.value ?? '').trim());
  if (blank) {
    const type = blank.querySelector('[name="mediaType"]');
    const url = blank.querySelector('[name="mediaUrl"]');
    if (type) type.value = normalizedType;
    if (url) url.value = normalizedUrl;
    syncMediaRows(container, countTarget, addButton);
    return true;
  }
  if (rows.length >= MAX_COMPOSER_MEDIA) return false;
  const removeRow = (row) => {
    if (container.querySelectorAll('[data-composer-media-row]').length <= 1) return;
    row.remove();
    syncMediaRows(container, countTarget, addButton);
  };
  container.append(createMediaRow({ type: normalizedType, url: normalizedUrl }, removeRow));
  syncMediaRows(container, countTarget, addButton);
  return true;
}

function setAccountOptions(select, accounts, platform) {
  const selected = select.value;
  const matches = accounts.filter((account) => account.provider === platform && account.state === 'CONNECTED');
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = matches.length ? 'Select account' : 'No connected account';
  select.append(placeholder);
  for (const account of matches) {
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = account.username ? `@${account.username}` : (account.displayName || account.providerAccountId || 'Connected account');
    select.append(option);
  }
  if (matches.some((account) => account.id === selected)) select.value = selected;
  select.disabled = matches.length === 0;
  return matches.length;
}

function applyAccountAvailability(accounts) {
  for (const platform of SOCIAL_PLATFORMS) {
    const checkbox = document.querySelector(`input[name="platform"][value="${platform}"]`);
    const select = document.querySelector(`[name="account:${platform}"]`);
    if (!checkbox || !select) continue;
    const count = setAccountOptions(select, accounts, platform);
    checkbox.disabled = count === 0;
    if (count === 0 || !select.value) checkbox.checked = false;
  }
}

function createPrivacyOption(value) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = value.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
  return option;
}

export async function initializeComposer({ onScheduled } = {}) {
  const form = document.querySelector('#social-composer');
  const scheduleInput = document.querySelector('#scheduled-at');
  const feedback = document.querySelector('#composer-feedback');
  const focusButton = document.querySelector('#focus-composer');
  if (!form || !scheduleInput || !feedback) {
    return { refreshAccounts: async () => [], useMedia: () => false, getState: () => null, applyState: async () => false, getAccounts: () => [] };
  }

  const fileInput = document.querySelector('#media-file');
  const uploadButton = document.querySelector('#upload-media');
  const uploadFeedback = document.querySelector('#media-upload-feedback');
  const fallbackMediaUrl = document.querySelector('#media-url');
  const fallbackMediaType = document.querySelector('#media-type');
  const submitButton = document.querySelector('#social-composer button[type="submit"]');
  const tiktokCheckbox = document.querySelector('input[name="platform"][value="tiktok"]');
  const tiktokAccount = document.querySelector('[name="account:tiktok"]');
  const tiktokPanel = document.querySelector('#tiktok-publishing-options');
  const tiktokIdentity = document.querySelector('#tiktok-creator-identity');
  const tiktokCapabilities = document.querySelector('#tiktok-capabilities-feedback');
  const tiktokPrivacy = document.querySelector('[name="tiktok:privacyLevel"]');
  const tiktokComment = document.querySelector('[name="tiktok:allowComment"]');
  const tiktokDuet = document.querySelector('[name="tiktok:allowDuet"]');
  const tiktokStitch = document.querySelector('[name="tiktok:allowStitch"]');
  let uploading = false;
  let scheduling = false;
  let tiktokCapabilityRequest = 0;

  let mediaContainer = document.querySelector('.media-grid');
  let addMediaButton = null;
  let mediaCount = null;
  if (mediaContainer?.replaceChildren && typeof document.createElement === 'function') {
    const initial = [{ type: fallbackMediaType?.value || 'image', url: fallbackMediaUrl?.value || '' }];
    mediaContainer.id = 'composer-media-items';
    mediaContainer.className = 'composer-media-items';
    addMediaButton = document.createElement('button');
    addMediaButton.id = 'add-media-item';
    addMediaButton.type = 'button';
    addMediaButton.className = 'button button--secondary';
    addMediaButton.textContent = 'Add media';
    mediaCount = document.createElement('small');
    mediaCount.id = 'composer-media-count';
    const actions = document.createElement('div');
    actions.className = 'composer-resource-actions';
    actions.append(addMediaButton, mediaCount);
    mediaContainer.after(actions);
    replaceMediaRows(mediaContainer, initial, mediaCount, addMediaButton);
    addMediaButton.addEventListener('click', () => {
      const rows = mediaContainer.querySelectorAll('[data-composer-media-row]');
      if (rows.length >= MAX_COMPOSER_MEDIA) return;
      const removeRow = (row) => {
        if (mediaContainer.querySelectorAll('[data-composer-media-row]').length <= 1) return;
        row.remove();
        syncMediaRows(mediaContainer, mediaCount, addMediaButton);
        notifyComposerInput(form);
      };
      mediaContainer.append(createMediaRow({}, removeRow));
      syncMediaRows(mediaContainer, mediaCount, addMediaButton);
      notifyComposerInput(form);
    });
  } else {
    mediaContainer = null;
  }

  function updateBusyControls() {
    const controls = [uploadButton, fileInput, fallbackMediaUrl, fallbackMediaType, submitButton, addMediaButton];
    if (mediaContainer?.querySelectorAll) controls.push(...mediaContainer.querySelectorAll('input,select,button'));
    for (const control of controls) if (control) control.disabled = uploading || scheduling;
    if (!uploading && !scheduling && mediaContainer) syncMediaRows(mediaContainer, mediaCount, addMediaButton);
  }

  function useMedia({ type, url } = {}) {
    const normalizedType = String(type ?? '').trim().toLowerCase();
    const normalizedUrl = String(url ?? '').trim();
    let used = false;
    if (mediaContainer) used = appendMediaToRows(mediaContainer, { type: normalizedType, url: normalizedUrl }, mediaCount, addMediaButton);
    else if (fallbackMediaUrl && fallbackMediaType && ['image', 'video'].includes(normalizedType) && normalizedUrl) {
      fallbackMediaUrl.value = normalizedUrl;
      fallbackMediaType.value = normalizedType;
      used = true;
    }
    if (!used) {
      if (uploadFeedback && normalizedUrl) {
        uploadFeedback.dataset.state = 'error';
        uploadFeedback.textContent = `A post can contain at most ${MAX_COMPOSER_MEDIA} media items.`;
      }
      return false;
    }
    if (uploadFeedback) {
      uploadFeedback.dataset.state = normalizedUrl.startsWith('https://') ? 'success' : 'warning';
      uploadFeedback.textContent = normalizedUrl.startsWith('https://')
        ? 'Media selected from library.'
        : 'Media selected, but provider publishing requires a public HTTPS URL.';
    }
    notifyComposerInput(form);
    return true;
  }

  function resetTikTokCapabilities({ hide = true } = {}) {
    tiktokCapabilityRequest += 1;
    if (tiktokPanel) tiktokPanel.hidden = hide;
    if (tiktokIdentity) tiktokIdentity.textContent = '';
    if (tiktokCapabilities) {
      tiktokCapabilities.dataset.state = '';
      tiktokCapabilities.textContent = '';
    }
    if (tiktokPrivacy) {
      tiktokPrivacy.replaceChildren();
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select privacy level';
      tiktokPrivacy.append(placeholder);
      tiktokPrivacy.value = '';
      tiktokPrivacy.disabled = true;
    }
    for (const control of [tiktokComment, tiktokDuet, tiktokStitch]) {
      if (!control) continue;
      control.checked = false;
      control.disabled = true;
    }
  }

  function applyTikTokCreatorInfo(info) {
    const privacyLevelOptions = Array.isArray(info?.privacyLevelOptions) ? info.privacyLevelOptions : [];
    if (tiktokPrivacy) {
      tiktokPrivacy.replaceChildren();
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select privacy level';
      tiktokPrivacy.append(placeholder);
      for (const value of privacyLevelOptions) tiktokPrivacy.append(createPrivacyOption(String(value)));
      tiktokPrivacy.value = '';
      tiktokPrivacy.disabled = privacyLevelOptions.length === 0;
    }
    if (tiktokIdentity) {
      tiktokIdentity.textContent = info?.creatorNickname
        ? `Posting as ${info.creatorNickname}${info.creatorUsername ? ` (@${info.creatorUsername})` : ''}`
        : 'TikTok creator connected.';
    }
    if (tiktokComment) tiktokComment.disabled = info?.commentDisabled === true;
    if (tiktokDuet) tiktokDuet.disabled = info?.duetDisabled === true;
    if (tiktokStitch) tiktokStitch.disabled = info?.stitchDisabled === true;
    const maximum = Number(info?.maxVideoPostDurationSec);
    if (tiktokCapabilities) {
      tiktokCapabilities.dataset.state = privacyLevelOptions.length ? 'success' : 'warning';
      tiktokCapabilities.textContent = privacyLevelOptions.length
        ? `Current TikTok publishing options loaded${Number.isFinite(maximum) ? `. Maximum video duration: ${maximum} seconds.` : '.'}`
        : 'TikTok returned no available privacy options for this creator.';
    }
  }

  async function refreshTikTokCapabilities() {
    const accountId = String(tiktokAccount?.value ?? '').trim();
    const active = tiktokCheckbox?.checked === true && Boolean(accountId);
    if (!active) {
      resetTikTokCapabilities();
      return;
    }
    const requestId = ++tiktokCapabilityRequest;
    if (tiktokPanel) tiktokPanel.hidden = false;
    if (tiktokCapabilities) {
      tiktokCapabilities.dataset.state = '';
      tiktokCapabilities.textContent = 'Loading current TikTok publishing options…';
    }
    if (tiktokPrivacy) tiktokPrivacy.disabled = true;
    try {
      const result = await getTikTokCreatorInfo(accountId);
      if (requestId !== tiktokCapabilityRequest || tiktokAccount?.value !== accountId || tiktokCheckbox?.checked !== true) return;
      applyTikTokCreatorInfo(result?.creatorInfo);
    } catch (error) {
      console.error(error);
      if (requestId !== tiktokCapabilityRequest) return;
      resetTikTokCapabilities({ hide: false });
      if (tiktokCapabilities) {
        tiktokCapabilities.dataset.state = 'error';
        tiktokCapabilities.textContent = 'Unable to load current TikTok publishing options. Reconnect the account or try again.';
      }
    }
  }

  uploadButton?.addEventListener('click', async () => {
    if (uploading || scheduling || !uploadFeedback) return;
    const file = fileInput?.files?.[0];
    if (!file) {
      uploadFeedback.dataset.state = 'error';
      uploadFeedback.textContent = 'Select a file to upload.';
      return;
    }
    uploading = true;
    updateBusyControls();
    uploadFeedback.dataset.state = '';
    uploadFeedback.textContent = 'Uploading…';
    try {
      const result = await uploadMedia(file);
      const media = describeUploadedMedia(result?.upload);
      if (!useMedia(media)) throw new Error('MEDIA_LIMIT');
      uploadFeedback.dataset.state = media.state;
      uploadFeedback.textContent = media.message;
    } catch (error) {
      uploadFeedback.dataset.state = 'error';
      uploadFeedback.textContent = error?.message === 'MEDIA_LIMIT'
        ? `A post can contain at most ${MAX_COMPOSER_MEDIA} media items.`
        : (UPLOAD_ERRORS[error?.payload?.error] || 'Unable to upload this file. Please try again.');
    } finally {
      uploading = false;
      updateBusyControls();
    }
  });

  setDefaultSchedule(scheduleInput);
  focusButton?.addEventListener('click', () => document.querySelector('#post-caption')?.focus());
  tiktokCheckbox?.addEventListener('change', refreshTikTokCapabilities);
  tiktokAccount?.addEventListener('change', refreshTikTokCapabilities);
  resetTikTokCapabilities();

  let accounts = [];
  async function refreshAccounts() {
    try {
      const result = await listAccounts();
      accounts = Array.isArray(result?.accounts) ? result.accounts : [];
      applyAccountAvailability(accounts);
      await refreshTikTokCapabilities();
      return accounts;
    } catch (error) {
      console.error(error);
      feedback.dataset.state = 'error';
      feedback.textContent = 'Unable to load connected accounts.';
      return accounts;
    }
  }

  function getState() {
    return buildPermissiveState(form, accounts);
  }

  async function applyState(state = {}) {
    const captionInput = form.elements.namedItem('caption');
    if (captionInput) captionInput.value = String(state.caption ?? '');
    if (mediaContainer) replaceMediaRows(mediaContainer, state.media, mediaCount, addMediaButton);
    else {
      if (fallbackMediaUrl) fallbackMediaUrl.value = String(state.media?.[0]?.url ?? '');
      if (fallbackMediaType) fallbackMediaType.value = String(state.media?.[0]?.type ?? 'image') || 'image';
    }
    if (scheduleInput && state.scheduledAt) scheduleInput.value = localDateTimeValue(state.scheduledAt);

    for (const platform of SOCIAL_PLATFORMS) {
      const checkbox = form.querySelector(`input[name="platform"][value="${platform}"]`);
      const select = form.querySelector(`[name="account:${platform}"]`);
      if (checkbox) checkbox.checked = false;
      if (select) select.value = '';
      const captionOverride = form.elements.namedItem(`override:${platform}:caption`);
      const mediaMode = form.elements.namedItem(`override:${platform}:mediaMode`);
      const overrideMediaUrl = form.elements.namedItem(`override:${platform}:mediaUrl`);
      const overrideMediaType = form.elements.namedItem(`override:${platform}:mediaType`);
      if (captionOverride) captionOverride.value = '';
      if (mediaMode) mediaMode.value = 'inherit';
      if (overrideMediaUrl) overrideMediaUrl.value = '';
      if (overrideMediaType) overrideMediaType.value = 'image';
    }

    applyAccountAvailability(accounts);
    for (const destination of Array.isArray(state.destinations) ? state.destinations : []) {
      const platform = String(destination.platform ?? '').toLowerCase();
      if (!SOCIAL_PLATFORMS.includes(platform)) continue;
      const checkbox = form.querySelector(`input[name="platform"][value="${platform}"]`);
      const select = form.querySelector(`[name="account:${platform}"]`);
      if (select && [...select.options].some((option) => option.value === destination.accountId)) select.value = destination.accountId;
      if (checkbox && select?.value) checkbox.checked = true;
      const captionOverride = form.elements.namedItem(`override:${platform}:caption`);
      if (captionOverride && destination.captionOverride != null) captionOverride.value = destination.captionOverride;
      const mediaMode = form.elements.namedItem(`override:${platform}:mediaMode`);
      const overrideMediaUrl = form.elements.namedItem(`override:${platform}:mediaUrl`);
      const overrideMediaType = form.elements.namedItem(`override:${platform}:mediaType`);
      if (mediaMode && Array.isArray(destination.mediaOverride)) {
        if (destination.mediaOverride.length === 0) mediaMode.value = 'none';
        else {
          mediaMode.value = 'custom';
          if (overrideMediaUrl) overrideMediaUrl.value = destination.mediaOverride[0]?.url ?? '';
          if (overrideMediaType) overrideMediaType.value = destination.mediaOverride[0]?.type ?? 'image';
        }
      }
    }

    await refreshTikTokCapabilities();
    const tiktokDestination = (state.destinations ?? []).find((item) => item.platform === 'tiktok');
    const options = tiktokDestination?.options ?? {};
    if (tiktokDestination && tiktokPrivacy && [...tiktokPrivacy.options].some((option) => option.value === options.privacyLevel)) {
      tiktokPrivacy.value = options.privacyLevel;
    }
    const booleanOptions = {
      'tiktok:allowComment': options.allowComment,
      'tiktok:allowDuet': options.allowDuet,
      'tiktok:allowStitch': options.allowStitch,
      'tiktok:commercialContent': options.commercialContent,
      'tiktok:brandOrganic': options.brandOrganic,
      'tiktok:brandContent': options.brandContent,
      'tiktok:isAigc': options.isAigc,
      'tiktok:consent': options.consent
    };
    for (const [name, value] of Object.entries(booleanOptions)) {
      const control = form.elements.namedItem(name);
      if (control && 'checked' in control) control.checked = value === true;
    }
    return true;
  }

  await refreshAccounts();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (uploading || scheduling) return;
    feedback.dataset.state = '';
    feedback.textContent = 'Scheduling…';
    try {
      const payload = buildComposerPayload({ formData: new FormData(form), accounts });
      scheduling = true;
      updateBusyControls();
      await createPost(payload);
      feedback.dataset.state = 'success';
      feedback.textContent = 'Post scheduled.';
      form.reset();
      if (mediaContainer) replaceMediaRows(mediaContainer, [], mediaCount, addMediaButton);
      if (uploadFeedback) {
        uploadFeedback.dataset.state = '';
        uploadFeedback.textContent = '';
      }
      setDefaultSchedule(scheduleInput);
      applyAccountAvailability(accounts);
      resetTikTokCapabilities();
      await onScheduled?.();
    } catch (error) {
      feedback.dataset.state = 'error';
      feedback.textContent = formatError(error);
    } finally {
      scheduling = false;
      updateBusyControls();
    }
  });

  return { refreshAccounts, useMedia, getState, applyState, getAccounts: () => [...accounts] };
}
