import {
  changeUserPassword,
  createUser,
  listUsers,
  revokeUserSessions,
  updateUser
} from '../api/users-api.js';

const ROLES = Object.freeze(['VIEWER', 'EDITOR', 'MANAGER', 'ADMIN']);
const STATUSES = Object.freeze(['ACTIVE', 'DISABLED']);

function option(value, selectedValue) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = value[0] + value.slice(1).toLowerCase();
  element.selected = value === selectedValue;
  return element;
}

function button(label, className = 'button button--secondary') {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  return element;
}

function describeError(error) {
  const code = error?.payload?.error ?? error?.message;
  if (code === 'username_conflict') return 'That username is already in use.';
  if (code === 'self_lockout_forbidden') return 'You cannot demote or disable your own administrator account.';
  if (code === 'last_admin_forbidden') return 'At least one active administrator must remain.';
  if (code === 'validation_error') return 'Check the user fields and use a password of at least 12 characters.';
  if (code === 'forbidden') return 'Administrator access is required.';
  return 'The user operation could not be completed.';
}

export function initializeUsers({ currentUser } = {}) {
  const adminOnly = [...document.querySelectorAll('[data-admin-only]')];
  const isAdmin = currentUser?.role === 'ADMIN';
  for (const element of adminOnly) element.hidden = !isAdmin;

  if (!isAdmin) return { refresh: async () => {} };

  const form = document.querySelector('#user-create-form');
  const list = document.querySelector('#user-list');
  const feedback = document.querySelector('#users-feedback');
  if (!form || !list || !feedback) return { refresh: async () => {} };

  const setFeedback = (message) => { feedback.textContent = message; };

  function renderUser(user) {
    const card = document.createElement('article');
    card.className = 'user-card';

    const header = document.createElement('div');
    header.className = 'user-card__header';
    const identity = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = user.displayName || user.username;
    const meta = document.createElement('p');
    meta.textContent = `@${user.username}${user.id === currentUser.id ? ' · You' : ''}`;
    identity.append(title, meta);
    const badge = document.createElement('span');
    badge.className = 'user-card__badge';
    badge.textContent = user.status;
    header.append(identity, badge);

    const fields = document.createElement('div');
    fields.className = 'user-card__grid';

    const displayLabel = document.createElement('label');
    displayLabel.className = 'field';
    const displayText = document.createElement('span');
    displayText.textContent = 'Display name';
    const displayInput = document.createElement('input');
    displayInput.type = 'text';
    displayInput.maxLength = 120;
    displayInput.value = user.displayName ?? '';
    displayLabel.append(displayText, displayInput);

    const roleLabel = document.createElement('label');
    roleLabel.className = 'field';
    const roleText = document.createElement('span');
    roleText.textContent = 'Role';
    const roleSelect = document.createElement('select');
    for (const role of ROLES) roleSelect.append(option(role, user.role));
    roleLabel.append(roleText, roleSelect);

    const statusLabel = document.createElement('label');
    statusLabel.className = 'field';
    const statusText = document.createElement('span');
    statusText.textContent = 'Status';
    const statusSelect = document.createElement('select');
    for (const status of STATUSES) statusSelect.append(option(status, user.status));
    statusLabel.append(statusText, statusSelect);

    if (user.id === currentUser.id) {
      roleSelect.disabled = true;
      statusSelect.disabled = true;
    }

    fields.append(displayLabel, roleLabel, statusLabel);

    const actions = document.createElement('div');
    actions.className = 'user-card__actions';
    const save = button('Save user', 'button button--primary');
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        await updateUser(user.id, {
          displayName: displayInput.value,
          role: roleSelect.value,
          status: statusSelect.value
        });
        setFeedback(`Saved ${user.username}.`);
        await refresh();
      } catch (error) {
        setFeedback(describeError(error));
      } finally {
        save.disabled = false;
      }
    });

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.minLength = 12;
    passwordInput.maxLength = 200;
    passwordInput.autocomplete = 'new-password';
    passwordInput.placeholder = 'New password (12+ characters)';
    passwordInput.setAttribute('aria-label', `New password for ${user.username}`);

    const changePassword = button('Change password');
    changePassword.addEventListener('click', async () => {
      changePassword.disabled = true;
      try {
        await changeUserPassword(user.id, passwordInput.value);
        passwordInput.value = '';
        if (user.id === currentUser.id) {
          window.location.replace('/login.html');
          return;
        }
        setFeedback(`Password changed for ${user.username}; existing sessions were revoked.`);
      } catch (error) {
        setFeedback(describeError(error));
      } finally {
        changePassword.disabled = false;
      }
    });

    const revoke = button('Revoke sessions');
    revoke.addEventListener('click', async () => {
      revoke.disabled = true;
      try {
        await revokeUserSessions(user.id);
        if (user.id === currentUser.id) {
          window.location.replace('/login.html');
          return;
        }
        setFeedback(`Sessions revoked for ${user.username}.`);
      } catch (error) {
        setFeedback(describeError(error));
      } finally {
        revoke.disabled = false;
      }
    });

    actions.append(save, passwordInput, changePassword, revoke);
    card.append(header, fields, actions);
    return card;
  }

  async function refresh() {
    try {
      const payload = await listUsers();
      const users = Array.isArray(payload?.users) ? payload.users : [];
      list.replaceChildren(...users.map(renderUser));
      if (users.length === 0) setFeedback('No users found.');
    } catch (error) {
      if (error?.status === 401) {
        window.location.replace('/login.html');
        return;
      }
      if (error?.status === 403) {
        for (const element of adminOnly) element.hidden = true;
      }
      setFeedback(describeError(error));
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    const data = new FormData(form);
    try {
      await createUser({
        username: data.get('username'),
        displayName: data.get('displayName'),
        role: data.get('role'),
        password: data.get('password')
      });
      form.reset();
      setFeedback('User created.');
      await refresh();
    } catch (error) {
      setFeedback(describeError(error));
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  void refresh();
  return { refresh };
}
