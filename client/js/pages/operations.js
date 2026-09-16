import { getOperations } from '../api/operations-api.js';

const PROVIDER_LABELS = Object.freeze({ instagram:'Instagram', facebook:'Facebook', threads:'Threads', tiktok:'TikTok' });

function clear(element) {
  element?.replaceChildren();
}

function text(tag, value, className = '') {
  const element = document.createElement(tag);
  element.textContent = String(value ?? '');
  if (className) element.className = className;
  return element;
}

function formatTime(value) {
  const date = new Date(value ?? '');
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '—';
}

function emptyState(message) {
  return text('p', message, 'operations-empty');
}

function diagnosticGroup(title, targetId) {
  const section = document.createElement('section');
  section.className = 'operations-group';
  const heading = text('h3', title);
  heading.id = `${targetId}-title`;
  section.setAttribute('aria-labelledby', heading.id);
  const target = document.createElement('div');
  target.id = targetId;
  target.className = 'operations-list';
  target.setAttribute('aria-live', 'polite');
  section.append(heading, target);
  return section;
}

function ensureDiagnosticGroups() {
  const operations = document.querySelector('#operations');
  if (!operations || document.querySelector('#runtime-health-list')) return;
  const grid = document.createElement('div');
  grid.className = 'operations-grid operations-diagnostics-grid';
  grid.append(
    diagnosticGroup('Runtime health', 'runtime-health-list'),
    diagnosticGroup('Environment diagnostics', 'environment-diagnostic-list')
  );
  const feedback = document.querySelector('#operations-feedback');
  if (feedback) feedback.insertAdjacentElement('afterend', grid);
  else operations.prepend(grid);
}

function renderProviders(items) {
  const target = document.querySelector('#provider-health-list');
  if (!target) return;
  clear(target);
  for (const item of items ?? []) {
    const card = document.createElement('article');
    card.className = 'operations-provider';
    card.dataset.state = String(item.healthState ?? 'UNKNOWN').toLowerCase();
    card.append(
      text('strong', PROVIDER_LABELS[item.provider] ?? item.provider),
      text('span', item.healthState ?? 'UNKNOWN', 'operations-provider__state'),
      text('small', item.limitedUntil ? `Rate limited until ${formatTime(item.limitedUntil)}` : (item.lastErrorCode ? `Last error: ${item.lastErrorCode}` : 'No active provider error'))
    );
    target.append(card);
  }
  if (!target.childElementCount) target.append(emptyState('No provider status is available yet.'));
}

function renderRuntime(runtime = {}) {
  const target = document.querySelector('#runtime-health-list');
  if (!target) return;
  clear(target);

  const database = runtime.database ?? {};
  const databaseRow = document.createElement('article');
  databaseRow.className = 'operations-row';
  databaseRow.append(
    text('strong', 'Database'),
    text('span', `${database.ok ? 'Healthy' : 'Unavailable'} · ${database.backend ?? 'unavailable'}`)
  );

  const storage = runtime.storage ?? {};
  const storageRow = document.createElement('article');
  storageRow.className = 'operations-row';
  const storageState = storage.ok && storage.writable ? 'Healthy' : 'Unavailable';
  storageRow.append(
    text('strong', 'Storage'),
    text('span', `${storageState} · ${storage.backend ?? 'unavailable'}${storage.writable ? ' · writable' : ''}`),
    text('small', storage.errorCode ? `Error: ${storage.errorCode}` : 'Writeability probe passed')
  );

  const scheduler = runtime.scheduler ?? {};
  const schedulerRow = document.createElement('article');
  schedulerRow.className = 'operations-row';
  const schedulerMode = scheduler.configured ? (scheduler.running ? 'Running' : 'Stopped') : 'Disabled';
  schedulerRow.append(
    text('strong', 'Scheduler'),
    text('span', `${schedulerMode} · ${scheduler.inFlight ? 'tick in flight' : 'stopped'}`),
    text('small', scheduler.lastSuccessfulTickAt ? `Last success: ${formatTime(scheduler.lastSuccessfulTickAt)}` : (scheduler.lastErrorCode ? `Last error: ${scheduler.lastErrorCode}` : 'No completed tick recorded'))
  );

  target.append(databaseRow, storageRow, schedulerRow);
}

function renderEnvironment(environment = {}) {
  const target = document.querySelector('#environment-diagnostic-list');
  if (!target) return;
  clear(target);
  const issues = Array.isArray(environment.issues) ? environment.issues : [];
  for (const issue of issues) {
    const row = document.createElement('article');
    row.className = 'operations-row operations-diagnostic';
    row.dataset.severity = String(issue.severity ?? 'warning').toLowerCase();
    row.append(
      text('strong', issue.code ?? 'CONFIGURATION_ISSUE'),
      text('span', issue.message ?? 'Configuration requires attention.'),
      text('small', issue.setting ?? '')
    );
    target.append(row);
  }
  if (!target.childElementCount) target.append(emptyState('No configuration issues detected.'));
}

function renderFailedJobs(items) {
  const target = document.querySelector('#failed-job-list');
  if (!target) return;
  clear(target);
  for (const item of items ?? []) {
    const row = document.createElement('article');
    row.className = 'operations-row';
    row.append(
      text('strong', `${item.type} · ${item.state}`),
      text('span', item.errorCode ?? 'No error code'),
      text('small', `Attempts ${item.attempts} · ${formatTime(item.updatedAt ?? item.scheduledAt)}`)
    );
    target.append(row);
  }
  if (!target.childElementCount) target.append(emptyState('No failed or retrying jobs.'));
}

function renderAttempts(items) {
  const target = document.querySelector('#publication-attempt-list');
  if (!target) return;
  clear(target);
  for (const item of items ?? []) {
    const row = document.createElement('article');
    row.className = 'operations-row';
    row.append(
      text('strong', `Attempt ${item.attempt} · ${item.state}`),
      text('span', item.providerErrorCode ?? 'No provider error'),
      text('small', `${item.publicationId} · ${formatTime(item.startedAt)}`)
    );
    target.append(row);
  }
  if (!target.childElementCount) target.append(emptyState('No publication attempts recorded yet.'));
}

function renderWebhooks(items) {
  const target = document.querySelector('#webhook-event-list');
  if (!target) return;
  clear(target);
  for (const item of items ?? []) {
    const row = document.createElement('article');
    row.className = 'operations-row';
    row.append(
      text('strong', `${item.provider} · ${item.eventType}`),
      text('span', `${item.processingState}${item.errorCode ? ` · ${item.errorCode}` : ''}`),
      text('small', formatTime(item.receivedAt))
    );
    target.append(row);
  }
  if (!target.childElementCount) target.append(emptyState('No verified webhook deliveries recorded yet.'));
}

export async function initializeOperations() {
  const feedback = document.querySelector('#operations-feedback');
  const refresh = document.querySelector('#refresh-operations');
  if (!document.querySelector('#operations')) return { refresh: async () => null };
  ensureDiagnosticGroups();

  async function load() {
    if (feedback) {
      feedback.dataset.state = '';
      feedback.textContent = 'Loading operational state…';
    }
    if (refresh) refresh.disabled = true;
    try {
      const data = await getOperations();
      renderProviders(data.providers);
      renderRuntime(data.runtime);
      renderEnvironment(data.environment);
      renderFailedJobs(data.failedJobs);
      renderAttempts(data.attempts);
      renderWebhooks(data.webhooks);
      if (feedback) feedback.textContent = '';
      return data;
    } catch (error) {
      console.error('Unable to load operations', { status:error?.status ?? null });
      if (feedback) {
        feedback.dataset.state = 'error';
        feedback.textContent = 'Unable to load operational state.';
      }
      return null;
    } finally {
      if (refresh) refresh.disabled = false;
    }
  }

  refresh?.addEventListener('click', load);
  await load();
  return { refresh:load };
}
