import { disconnectAccount } from '../api/accounts-api.js';

const PROVIDERS = Object.freeze([
  { key: 'instagram', name: 'Instagram', type: 'Social publishing' },
  { key: 'facebook', name: 'Facebook Pages', type: 'Social publishing' },
  { key: 'threads', name: 'Threads', type: 'Social publishing' },
  { key: 'tiktok', name: 'TikTok', type: 'Social publishing' },
  { key: 'whatsapp', name: 'WhatsApp Business', type: 'Business messaging' }
]);

function connectUrl(provider) {
  return `/auth/${encodeURIComponent(provider)}/start?returnTo=${encodeURIComponent('/#accounts')}`;
}

function createProviderCard(provider, accounts) {
  const account = accounts.find((item) => item.platform === provider.key && item.connected);
  const card = document.createElement('article');
  card.className = 'account-provider card';

  const header = document.createElement('div');
  header.className = 'account-provider__header';
  const copy = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = provider.name;
  const type = document.createElement('p');
  type.className = 'account-provider__type';
  type.textContent = provider.type;
  copy.append(title, type);

  const badge = document.createElement('span');
  badge.className = 'account-provider__status';
  badge.dataset.connected = String(Boolean(account));
  badge.textContent = account ? 'Connected' : 'Not connected';
  header.append(copy, badge);

  const detail = document.createElement('p');
  detail.className = 'account-provider__detail';
  detail.textContent = account?.displayName || (account ? 'Authorized account' : 'Connect an account to prepare provider publishing.');

  const actions = document.createElement('div');
  actions.className = 'account-provider__actions';
  if (account) {
    const button = document.createElement('button');
    button.className = 'button button--secondary';
    button.type = 'button';
    button.dataset.disconnectAccount = account.id;
    button.textContent = 'Disconnect';
    actions.append(button);
  } else {
    const link = document.createElement('a');
    link.className = 'button button--primary';
    link.href = connectUrl(provider.key);
    link.textContent = 'Connect';
    actions.append(link);
  }

  card.append(header, detail, actions);
  return card;
}

export function renderAccounts(accounts = []) {
  const grid = document.querySelector('#account-provider-grid');
  if (grid) grid.replaceChildren(...PROVIDERS.map((provider) => createProviderCard(provider, accounts)));

  const count = document.querySelector('#connected-account-count');
  if (count) {
    const connected = accounts.filter((account) => account.connected).length;
    count.textContent = `${connected} connected`;
  }
}

export function initializeAccounts({ onChanged } = {}) {
  const grid = document.querySelector('#account-provider-grid');
  if (!grid) return;
  grid.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-disconnect-account]');
    if (!button) return;
    button.disabled = true;
    try {
      await disconnectAccount(button.dataset.disconnectAccount);
      await onChanged?.();
    } catch (error) {
      console.error(error);
      button.disabled = false;
    }
  });
}
