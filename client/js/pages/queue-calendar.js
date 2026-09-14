import { listAccounts } from '../api/accounts-api.js';
import {
  bulkCancelPosts,
  bulkReschedulePosts,
  cancelPost,
  duplicatePost,
  listPosts,
  retryPublication,
  updatePost
} from '../api/posts-api.js';
import {
  getCalendarDays,
  localDateKey,
  moveCalendarAnchor,
  rescheduleIsoForDrop
} from '../components/calendar.js';

const FAILED_STATES = new Set(['FAILED', 'API_ERROR', 'MEDIA_ERROR', 'AUTH_ERROR', 'RATE_LIMITED']);

function node(selector) { return document.querySelector(selector); }
function text(value) { return String(value ?? ''); }

function localDateTimeInput(iso) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ];
  const time = [String(date.getHours()).padStart(2, '0'), String(date.getMinutes()).padStart(2, '0')];
  return `${parts.join('-')}T${time.join(':')}`;
}

function inputToIso(value) {
  const date = new Date(String(value ?? ''));
  if (!Number.isFinite(date.getTime())) throw new TypeError('Choose a valid date and time.');
  return date.toISOString();
}

function calendarTitle(mode, anchor) {
  const formatter = new Intl.DateTimeFormat(undefined, mode === 'day'
    ? { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
    : { year: 'numeric', month: 'long', ...(mode === 'week' ? { day: 'numeric' } : {}) });
  if (mode !== 'week') return formatter.format(anchor);
  const days = getCalendarDays('week', anchor);
  return `${formatter.format(days[0])} – ${formatter.format(days[6])}`;
}

function summarizeError(error) {
  const code = error?.payload?.error;
  const reason = error?.payload?.reason;
  if (code === 'validation_error') {
    const detail = error?.payload?.details?.[0]?.message;
    return detail || 'The requested change is invalid.';
  }
  if (code === 'lifecycle_conflict') return `Action blocked: ${text(reason || 'state conflict').replaceAll('_', ' ')}.`;
  if (error?.status === 404) return 'The selected post no longer exists.';
  if (error?.status === 401) return 'Your session expired. Sign in again.';
  return 'The operation could not be completed.';
}

function publicationState(post) {
  const states = (post.publications ?? []).map((item) => String(item.state ?? '').toUpperCase());
  if (!states.length) return 'UNKNOWN';
  if (states.every((state) => state === states[0])) return states[0];
  if (states.some((state) => FAILED_STATES.has(state))) return 'FAILED';
  if (states.some((state) => state === 'PROCESSING')) return 'PROCESSING';
  if (states.some((state) => state === 'SCHEDULED' || state === 'RETRYING')) return 'SCHEDULED';
  return 'MIXED';
}

function createBadge(publication) {
  const badge = document.createElement('span');
  badge.className = 'platform-state';
  badge.dataset.state = String(publication.state ?? '').toLowerCase();
  badge.textContent = `${publication.platform} · ${String(publication.state ?? 'unknown').toLowerCase()}`;
  return badge;
}

function actionButton(label, action, className = 'button button--secondary') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}

function option(value, label) {
  const item = document.createElement('option');
  item.value = value;
  item.textContent = label;
  return item;
}

export function initializeQueueCalendar({ onChanged = null } = {}) {
  const elements = {
    queueList: node('#scheduled-post-list'),
    queueCount: node('#scheduled-post-count'),
    queueFeedback: node('#queue-feedback'),
    filterForm: node('#queue-filter-form'),
    platformFilter: node('#queue-platform-filter'),
    accountFilter: node('#queue-account-filter'),
    stateFilter: node('#queue-state-filter'),
    refreshQueue: node('#refresh-queue'),
    bulkTime: node('#queue-bulk-time'),
    bulkReschedule: node('#queue-bulk-reschedule'),
    bulkCancel: node('#queue-bulk-cancel'),
    calendarMode: node('#calendar-mode'),
    calendarPrev: node('#calendar-prev'),
    calendarToday: node('#calendar-today'),
    calendarNext: node('#calendar-next'),
    calendarTitle: node('#calendar-title'),
    calendarGrid: node('#calendar-grid'),
    calendarFeedback: node('#calendar-feedback')
  };

  if (!elements.queueList || !elements.calendarGrid) return { refresh: async () => {} };

  const state = {
    posts: [],
    selected: new Set(),
    filters: {},
    mode: elements.calendarMode?.value || 'month',
    anchor: new Date(),
    draggingPostId: null
  };

  function setFeedback(message, kind = 'info') {
    for (const target of [elements.queueFeedback, elements.calendarFeedback]) {
      if (!target) continue;
      target.textContent = message;
      target.dataset.kind = kind;
    }
  }

  function clearFeedback() { setFeedback('', 'info'); }

  async function mutate(work, successMessage) {
    clearFeedback();
    try {
      await work();
      setFeedback(successMessage, 'success');
      await refresh();
      if (typeof onChanged === 'function') await onChanged();
      return true;
    } catch (error) {
      setFeedback(summarizeError(error), 'error');
      return false;
    }
  }

  function updateBulkControls() {
    const count = state.selected.size;
    if (elements.bulkCancel) elements.bulkCancel.disabled = count === 0;
    if (elements.bulkReschedule) elements.bulkReschedule.disabled = count === 0;
  }

  function createQueueRow(post) {
    const row = document.createElement('article');
    row.className = 'queue-row';
    row.dataset.postId = post.id;

    const selection = document.createElement('label');
    selection.className = 'queue-row__selection';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selected.has(post.id);
    checkbox.setAttribute('aria-label', `Select ${post.caption || 'post'}`);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selected.add(post.id);
      else state.selected.delete(post.id);
      updateBulkControls();
    });
    selection.append(checkbox);

    const body = document.createElement('div');
    body.className = 'queue-row__body';
    const caption = document.createElement('strong');
    caption.className = 'queue-row__caption';
    caption.textContent = post.caption;
    const meta = document.createElement('span');
    meta.className = 'queue-row__meta';
    meta.textContent = new Date(post.scheduledAt).toLocaleString();
    const badges = document.createElement('div');
    badges.className = 'queue-row__badges';
    for (const publication of post.publications ?? []) badges.append(createBadge(publication));
    body.append(caption, meta, badges);

    const actions = document.createElement('div');
    actions.className = 'queue-row__actions';
    actions.append(
      actionButton('Edit caption', async () => {
        const next = window.prompt('Edit caption', post.caption);
        if (next == null || next.trim() === post.caption) return;
        await mutate(() => updatePost(post.id, { caption: next }), 'Caption updated.');
      }),
      actionButton('Reschedule', async () => {
        const next = window.prompt('New local publish date/time (YYYY-MM-DDTHH:mm)', localDateTimeInput(post.scheduledAt));
        if (!next) return;
        let scheduledAt;
        try { scheduledAt = inputToIso(next); }
        catch (error) { setFeedback(error.message, 'error'); return; }
        await mutate(() => updatePost(post.id, { scheduledAt }), 'Post rescheduled.');
      }),
      actionButton('Duplicate', async () => {
        const next = window.prompt('Duplicate publish date/time (YYYY-MM-DDTHH:mm)', localDateTimeInput(post.scheduledAt));
        if (!next) return;
        let scheduledAt;
        try { scheduledAt = inputToIso(next); }
        catch (error) { setFeedback(error.message, 'error'); return; }
        await mutate(() => duplicatePost(post.id, { scheduledAt }), 'Post duplicated.');
      }),
      actionButton('Cancel', () => mutate(() => cancelPost(post.id), 'Post cancelled.'), 'button button--danger')
    );

    for (const publication of post.publications ?? []) {
      if (!FAILED_STATES.has(String(publication.state ?? '').toUpperCase())) continue;
      actions.append(actionButton(`Retry ${publication.platform}`, () => mutate(
        () => retryPublication(publication.id),
        `${publication.platform} retry scheduled.`
      )));
    }

    row.append(selection, body, actions);
    return row;
  }

  function renderQueue() {
    if (elements.queueCount) elements.queueCount.textContent = `${state.posts.length} ${state.posts.length === 1 ? 'post' : 'posts'}`;
    state.selected = new Set([...state.selected].filter((id) => state.posts.some((post) => post.id === id)));
    updateBulkControls();
    if (!state.posts.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      const title = document.createElement('h3');
      title.textContent = 'No posts match this queue view';
      const copy = document.createElement('p');
      copy.textContent = 'Adjust the filters or schedule a new social post.';
      empty.append(title, copy);
      elements.queueList.replaceChildren(empty);
      return;
    }
    elements.queueList.replaceChildren(...state.posts.map(createQueueRow));
  }

  function createCalendarPost(post) {
    const card = document.createElement('article');
    card.className = 'calendar-post';
    card.draggable = true;
    card.dataset.postId = post.id;
    const caption = document.createElement('strong');
    caption.textContent = post.caption;
    const time = document.createElement('span');
    time.textContent = new Date(post.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const status = document.createElement('span');
    status.className = 'calendar-post__state';
    status.textContent = publicationState(post).toLowerCase();
    card.append(time, caption, status);
    card.addEventListener('dragstart', (event) => {
      state.draggingPostId = post.id;
      event.dataTransfer?.setData('text/plain', post.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => { state.draggingPostId = null; });
    return card;
  }

  function renderCalendar() {
    const days = getCalendarDays(state.mode, state.anchor);
    if (elements.calendarTitle) elements.calendarTitle.textContent = calendarTitle(state.mode, state.anchor);
    elements.calendarGrid.dataset.mode = state.mode;
    const postsByDate = new Map();
    for (const post of state.posts) {
      const date = new Date(post.scheduledAt);
      if (!Number.isFinite(date.getTime())) continue;
      const key = localDateKey(date);
      if (!postsByDate.has(key)) postsByDate.set(key, []);
      postsByDate.get(key).push(post);
    }

    const cells = days.map((day) => {
      const key = localDateKey(day);
      const cell = document.createElement('section');
      cell.className = 'calendar-day';
      cell.dataset.date = key;
      if (day.getMonth() !== state.anchor.getMonth() && state.mode === 'month') cell.dataset.outside = 'true';
      if (key === localDateKey(new Date())) cell.dataset.today = 'true';
      const heading = document.createElement('div');
      heading.className = 'calendar-day__heading';
      const weekday = document.createElement('span');
      weekday.textContent = day.toLocaleDateString(undefined, { weekday: 'short' });
      const number = document.createElement('strong');
      number.textContent = String(day.getDate());
      heading.append(weekday, number);
      const items = document.createElement('div');
      items.className = 'calendar-day__items';
      for (const post of postsByDate.get(key) ?? []) items.append(createCalendarPost(post));
      cell.append(heading, items);
      cell.addEventListener('dragover', (event) => {
        if (!state.draggingPostId) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      });
      cell.addEventListener('drop', async (event) => {
        event.preventDefault();
        const postId = event.dataTransfer?.getData('text/plain') || state.draggingPostId;
        const post = state.posts.find((item) => item.id === postId);
        if (!post) return;
        let scheduledAt;
        try { scheduledAt = rescheduleIsoForDrop(post.scheduledAt, key); }
        catch (error) { setFeedback(error.message, 'error'); return; }
        await mutate(() => updatePost(post.id, { scheduledAt }), 'Post rescheduled from calendar.');
      });
      return cell;
    });
    elements.calendarGrid.replaceChildren(...cells);
  }

  function readFilters() {
    state.filters = {
      platform: elements.platformFilter?.value || '',
      accountId: elements.accountFilter?.value || '',
      state: elements.stateFilter?.value || ''
    };
  }

  async function refresh() {
    readFilters();
    try {
      const result = await listPosts(state.filters);
      state.posts = Array.isArray(result?.posts) ? result.posts : [];
      renderQueue();
      renderCalendar();
    } catch (error) {
      setFeedback(summarizeError(error), 'error');
    }
  }

  async function loadAccounts() {
    if (!elements.accountFilter) return;
    try {
      const result = await listAccounts();
      const accounts = Array.isArray(result?.accounts) ? result.accounts : [];
      const current = elements.accountFilter.value;
      const options = [option('', 'All accounts')];
      for (const account of accounts) {
        const label = `${account.displayName || account.providerAccountId || account.id} · ${account.provider}`;
        options.push(option(account.id, label));
      }
      elements.accountFilter.replaceChildren(...options);
      elements.accountFilter.value = current;
    } catch {
      elements.accountFilter.replaceChildren(option('', 'All accounts'));
    }
  }

  elements.filterForm?.addEventListener('submit', async (event) => { event.preventDefault(); await refresh(); });
  elements.refreshQueue?.addEventListener('click', refresh);
  elements.calendarMode?.addEventListener('change', () => {
    state.mode = elements.calendarMode.value;
    renderCalendar();
  });
  elements.calendarPrev?.addEventListener('click', () => { state.anchor = moveCalendarAnchor(state.mode, state.anchor, -1); renderCalendar(); });
  elements.calendarToday?.addEventListener('click', () => { state.anchor = new Date(); renderCalendar(); });
  elements.calendarNext?.addEventListener('click', () => { state.anchor = moveCalendarAnchor(state.mode, state.anchor, 1); renderCalendar(); });

  elements.bulkCancel?.addEventListener('click', async () => {
    const ids = [...state.selected];
    if (!ids.length) return;
    await mutate(() => bulkCancelPosts(ids), `${ids.length} selected post${ids.length === 1 ? '' : 's'} cancelled.`);
    state.selected.clear();
  });

  elements.bulkReschedule?.addEventListener('click', async () => {
    const ids = [...state.selected];
    if (!ids.length) return;
    let scheduledAt;
    try { scheduledAt = inputToIso(elements.bulkTime?.value); }
    catch (error) { setFeedback(error.message, 'error'); return; }
    await mutate(() => bulkReschedulePosts(ids, scheduledAt), `${ids.length} selected post${ids.length === 1 ? '' : 's'} rescheduled.`);
    state.selected.clear();
  });

  const ready = Promise.all([loadAccounts(), refresh()]);
  return { refresh: async () => { await ready; await refresh(); } };
}
