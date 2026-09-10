import { disconnectAccount, listAccounts, startOAuth } from '../api/accounts-api.js';

const PROVIDER_LABELS = Object.freeze({
  instagram: 'Instagram',
  facebook: 'Facebook',
  threads: 'Threads',
  tiktok: 'TikTok'
});
const OAUTH_ENABLED_PROVIDERS = new Set(['instagram']);
const OAUTH_ERROR_MESSAGES = Object.freeze({
  oauth_code_required: 'The provider did not return an authorization code.',
  oauth_state_invalid: 'The connection request expired or was already used. Try connecting again.',
  oauth_state_provider_mismatch: 'The connection response did not match the requested provider.',
  oauth_provider_error: 'The provider could not complete the connection.',
  oauth_not_configured: 'OAuth token encryption is not configured on this Srocial server.'
});

function providerLabel(provider) {
  if (PROVIDER_LABELS[provider]) return PROVIDER_LABELS[provider];
  return provider ? `${provider.charAt(0).toUpperCase()}${provider.slice(1)}` : 'Unknown';
}

export function buildAccountViewModel(account = {}) {
  const provider = String(account.provider ?? '').trim().toLowerCase();
  const username = String(account.username ?? '').trim();
  const displayName = String(account.displayName ?? '').trim();
  const providerAccountId = String(account.providerAccountId ?? '').trim();
  const state = String(account.state ?? 'DISCONNECTED').trim().toUpperCase();

  return {
    id: String(account.id ?? ''),
    provider,
    providerLabel: providerLabel(provider),
    identity: username ? `@${username}` : (providerAccountId || displayName || 'Account'),
    displayName,
    state,
    canReconnect: OAUTH_ENABLED_PROVIDERS.has(provider),
    canDisconnect: state === 'CONNECTED'
  };
}

function createButton(label, { action, accountId = '', provider = '', primary = false } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `button ${primary ? 'button--primary' : 'button--secondary'}`;
  button.textContent = label;
  button.dataset.action = action;
  if (accountId) button.dataset.accountId = accountId;
  if (provider) button.dataset.provider = provider;
  return button;
}

function renderAccountRow(account) {
  const model = buildAccountViewModel(account);
  const row = document.createElement('article');
  row.className = 'account-row';

  const main = document.createElement('div');
  main.className = 'account-row__main';

  const title = document.createElement('div');
  title.className = 'account-row__title';
  const provider = document.createElement('strong');
  provider.textContent = model.providerLabel;
  const state = document.createElement('span');
  state.className = 'account-state';
  state.textContent = model.state;
  title.append(provider, state);

  const identity = document.createElement('p');
  identity.className = 'account-row__identity';
  identity.textContent = model.identity;
  main.append(title, identity);

  if (model.displayName && model.displayName !== model.identity) {
    const name = document.createElement('p');
    name.className = 'account-row__meta';
    name.textContent = model.displayName;
    main.append(name);
  }

  const actions = document.createElement('div');
  actions.className = 'account-row__actions';
  if (model.canReconnect) {
    actions.append(createButton(model.state === 'CONNECTED' ? 'Reconnect' : 'Connect', {
      action: 'reconnect',
      accountId: model.id,
      provider: model.provider
    }));
  }
  if (model.canDisconnect) {
    actions.append(createButton('Disconnect', {
      action: 'disconnect',
      accountId: model.id,
      provider: model.provider
    }));
  }

  row.append(main, actions);
  return row;
}

function cleanOAuthResultFromUrl() {
  const url = new URL(window.location.href);
  const hadOAuthParams = ['oauth', 'status', 'code'].some((name) => url.searchParams.has(name));
  if (!hadOAuthParams) return;
  url.searchParams.delete('oauth');
  url.searchParams.delete('status');
  url.searchParams.delete('code');
  const query = url.searchParams.toString();
  history.replaceState({}, '', `${url.pathname}${query ? `?${query}` : ''}${url.hash}`);
}

function showOAuthResult(feedback) {
  const url = new URL(window.location.href);
  const provider = String(url.searchParams.get('oauth') ?? '').trim().toLowerCase();
  const status = url.searchParams.get('status');
  const code = url.searchParams.get('code');
  if (!provider && !status && !code) return;

  feedback.dataset.state = status === 'connected' ? 'success' : 'error';
  if (status === 'connected') {
    feedback.textContent = `${providerLabel(provider)} connected successfully.`;
  } else {
    feedback.textContent = OAUTH_ERROR_MESSAGES[code] ?? 'The account connection could not be completed.';
  }
  cleanOAuthResultFromUrl();
}

function validateAuthorizationUrl(value) {
  const url = new URL(String(value ?? ''));
  if (url.protocol !== 'https:') throw new Error('INVALID_AUTHORIZATION_URL');
  return url.toString();
}

export async function initializeAccounts({ onChanged } = {}) {
  const list = document.querySelector('#account-list');
  const feedback = document.querySelector('#accounts-feedback');
  const connectInstagram = document.querySelector('#connect-instagram');
  if (!list || !feedback) return { refresh: async () => {} };

  let accounts = [];

  function setFeedback(message, state = '') {
    feedback.dataset.state = state;
    feedback.textContent = message;
  }

  function render() {
    list.replaceChildren();
    if (accounts.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'account-empty';
      empty.textContent = 'No accounts connected yet.';
      list.append(empty);
      return;
    }
    for (const account of accounts) list.append(renderAccountRow(account));
  }

  async function refresh() {
    try {
      const result = await listAccounts();
      accounts = Array.isArray(result?.accounts) ? result.accounts : [];
      render();
      return accounts;
    } catch (error) {
      console.error(error);
      setFeedback('Unable to load connected accounts.', 'error');
      return [];
    }
  }

  async function connectProvider(provider, button) {
    if (!OAUTH_ENABLED_PROVIDERS.has(provider)) return;
    const previousText = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = 'Connecting…';
    }
    setFeedback(`Starting ${providerLabel(provider)} connection…`);
    try {
      const result = await startOAuth(provider);
      window.location.assign(validateAuthorizationUrl(result?.authorizationUrl));
    } catch (error) {
      console.error(error);
      if (button) {
        button.disabled = false;
        button.textContent = previousText;
      }
      setFeedback(`Unable to start ${providerLabel(provider)} connection.`, 'error');
    }
  }

  connectInstagram?.addEventListener('click', () => connectProvider('instagram', connectInstagram));

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || !list.contains(button)) return;
    const action = button.dataset.action;
    const accountId = String(button.dataset.accountId ?? '');
    const provider = String(button.dataset.provider ?? '').toLowerCase();

    if (action === 'reconnect') {
      await connectProvider(provider, button);
      return;
    }
    if (action !== 'disconnect' || !accountId) return;

    button.disabled = true;
    setFeedback('Disconnecting account…');
    try {
      await disconnectAccount(accountId);
      setFeedback(`${providerLabel(provider)} disconnected.`, 'success');
      await refresh();
      await onChanged?.();
    } catch (error) {
      console.error(error);
      button.disabled = false;
      setFeedback('Unable to disconnect this account.', 'error');
    }
  });

  showOAuthResult(feedback);
  await refresh();
  return { refresh };
}
