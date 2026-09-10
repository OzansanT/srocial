import { createPost } from '../api/posts-api.js';
import { listAccounts } from '../api/accounts-api.js';

const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'threads', 'tiktok'];

function setDefaultSchedule(input) {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  input.value = local;
  input.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
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

export function buildComposerPayload({ formData, accounts = [] }) {
  const platforms = formData.getAll('platform').map((value) => String(value).trim().toLowerCase()).filter(Boolean);
  const destinations = platforms.map((platform) => {
    const accountId = String(formData.get(`account:${platform}`) ?? '').trim();
    if (!connectedAccount(accounts, platform, accountId)) {
      throw new Error(`Select a connected account for ${platform}.`);
    }
    return { platform, accountId };
  });

  const scheduledAtValue = String(formData.get('scheduledAt') ?? '');
  const localDate = new Date(scheduledAtValue);
  if (!Number.isFinite(localDate.getTime())) throw new Error('Select a valid publish time.');

  const mediaUrl = String(formData.get('mediaUrl') ?? '').trim();
  const mediaType = String(formData.get('mediaType') ?? 'image').trim().toLowerCase();
  const media = mediaUrl ? [{ type: mediaType, url: mediaUrl }] : [];

  return {
    caption: String(formData.get('caption') ?? ''),
    destinations,
    media,
    scheduledAt: localDate.toISOString()
  };
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

export async function initializeComposer({ onScheduled } = {}) {
  const form = document.querySelector('#social-composer');
  const scheduleInput = document.querySelector('#scheduled-at');
  const feedback = document.querySelector('#composer-feedback');
  const focusButton = document.querySelector('#focus-composer');
  if (!form || !scheduleInput || !feedback) return { refreshAccounts: async () => [] };

  setDefaultSchedule(scheduleInput);
  focusButton?.addEventListener('click', () => document.querySelector('#post-caption')?.focus());

  let accounts = [];
  async function refreshAccounts() {
    try {
      const result = await listAccounts();
      accounts = Array.isArray(result?.accounts) ? result.accounts : [];
      applyAccountAvailability(accounts);
      return accounts;
    } catch (error) {
      console.error(error);
      feedback.dataset.state = 'error';
      feedback.textContent = 'Unable to load connected accounts.';
      return accounts;
    }
  }

  await refreshAccounts();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.dataset.state = '';
    feedback.textContent = 'Scheduling…';
    try {
      const payload = buildComposerPayload({ formData: new FormData(form), accounts });
      await createPost(payload);
      feedback.dataset.state = 'success';
      feedback.textContent = 'Post scheduled.';
      form.reset();
      setDefaultSchedule(scheduleInput);
      applyAccountAvailability(accounts);
      await onScheduled?.();
    } catch (error) {
      feedback.dataset.state = 'error';
      feedback.textContent = formatError(error);
    }
  });

  return { refreshAccounts };
}
