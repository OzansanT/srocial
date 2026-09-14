import { listAccounts } from '../api/accounts-api.js';
import { getAnalytics, refreshAnalytics, refreshPublicationAnalytics } from '../api/analytics-api.js';

const METRICS = Object.freeze([
  ['views', 'Views'], ['reach', 'Reach'], ['likes', 'Likes'],
  ['comments', 'Comments'], ['shares', 'Shares'], ['saves', 'Saves']
]);

function byId(id) { return document.getElementById(id); }
function clear(node) { while (node?.firstChild) node.removeChild(node.firstChild); }
function text(tag, value, className = '') {
  const node = document.createElement(tag);
  node.textContent = String(value ?? '');
  if (className) node.className = className;
  return node;
}
function formatNumber(value) { return value == null ? '—' : Number(value).toLocaleString(); }
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '—';
}
function filters() {
  return {
    platform: byId('analyticsPlatform')?.value ?? '',
    accountId: byId('analyticsAccount')?.value ?? '',
    from: byId('analyticsFrom')?.value ?? '',
    until: byId('analyticsUntil')?.value ?? ''
  };
}

function renderKpis(summary = {}) {
  const root = byId('analyticsKpis');
  clear(root);
  for (const [key, label] of METRICS) {
    const card = text('article', '', 'analytics-kpi');
    card.append(text('span', label, 'analytics-kpi-label'));
    card.append(text('strong', formatNumber(summary[key]), 'analytics-kpi-value'));
    root?.append(card);
  }
}

function renderSeries(series = []) {
  const root = byId('analyticsSeries');
  clear(root);
  const maxViews = Math.max(1, ...series.map((item) => Number(item.views ?? 0)));
  if (!series.length) {
    root?.append(text('p', 'No metric snapshots in this range.', 'muted'));
    return;
  }
  for (const item of series) {
    const row = text('div', '', 'analytics-series-row');
    const header = text('div', '', 'analytics-series-header');
    header.append(text('span', item.date), text('strong', `${formatNumber(item.views)} views`));
    const track = text('div', '', 'analytics-series-track');
    const bar = text('div', '', 'analytics-series-bar');
    bar.style.width = `${Math.max(2, Math.round((Number(item.views ?? 0) / maxViews) * 100))}%`;
    track.append(bar);
    row.append(header, track);
    root?.append(row);
  }
}

function metricCell(value) {
  const cell = document.createElement('td');
  cell.textContent = formatNumber(value);
  return cell;
}

function renderPosts(posts = []) {
  const root = byId('analyticsPosts');
  clear(root);
  if (!posts.length) {
    root?.append(text('p', 'No post analytics are available for the current filters.', 'muted'));
    return;
  }
  const table = text('table', '', 'analytics-table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of ['Post', 'Platform', 'Account', 'Published', 'Views', 'Reach', 'Likes', 'Comments', 'Shares', 'Saves', '']) {
    headRow.append(text('th', label));
  }
  thead.append(headRow);
  const tbody = document.createElement('tbody');
  for (const post of posts) {
    const row = document.createElement('tr');
    row.append(text('td', post.caption || post.postId));
    row.append(text('td', post.platform));
    row.append(text('td', post.accountName || post.accountId || '—'));
    row.append(text('td', formatDate(post.publishedAt)));
    for (const [key] of METRICS) row.append(metricCell(post.metrics?.[key]));
    const actionCell = document.createElement('td');
    const button = text('button', 'Refresh', 'button button-secondary button-small');
    button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await refreshPublicationAnalytics(post.publicationId); await loadAnalytics(); }
      catch (error) { showStatus(error?.message ?? 'Analytics refresh failed.', true); }
      finally { button.disabled = false; }
    });
    actionCell.append(button);
    row.append(actionCell);
    tbody.append(row);
  }
  table.append(thead, tbody);
  root?.append(table);
}

function showStatus(message, isError = false) {
  const root = byId('analyticsStatus');
  if (!root) return;
  root.textContent = String(message ?? '');
  root.dataset.state = isError ? 'error' : 'ready';
}

function renderReport(report = {}) {
  renderKpis(report.summary ?? {});
  renderSeries(report.series ?? []);
  renderPosts(report.posts ?? []);
  const newest = report.freshness?.newestCapturedAt;
  const oldest = report.freshness?.oldestCapturedAt;
  showStatus(report.count
    ? `${report.count} posts · snapshots ${formatDate(oldest)} — ${formatDate(newest)}`
    : 'No analytics snapshots for this filter. Use Refresh recent to collect supported metrics.');
}

async function loadAccounts() {
  const select = byId('analyticsAccount');
  if (!select) return;
  const previous = select.value;
  while (select.options.length > 1) select.remove(1);
  const payload = await listAccounts();
  const accounts = payload?.accounts ?? payload ?? [];
  for (const account of accounts) {
    if (!['instagram', 'facebook', 'threads', 'tiktok'].includes(account.provider)) continue;
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = `${account.displayName || account.username || account.provider} · ${account.provider}`;
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}

async function loadAnalytics() {
  try {
    showStatus('Loading analytics…');
    const report = await getAnalytics(filters());
    renderReport(report);
  } catch (error) {
    showStatus(error?.message ?? 'Analytics could not be loaded.', true);
  }
}

async function refreshRecent() {
  const button = byId('analyticsRefresh');
  if (button) button.disabled = true;
  try {
    showStatus('Refreshing recent published posts…');
    const result = await refreshAnalytics(filters());
    showStatus(`Refresh complete: ${result.succeeded ?? 0} succeeded, ${result.failed ?? 0} failed.`);
    await loadAnalytics();
  } catch (error) {
    showStatus(error?.message ?? 'Analytics refresh failed.', true);
  } finally {
    if (button) button.disabled = false;
  }
}

export async function initAnalyticsPage() {
  if (!byId('analyticsPanel')) return;
  byId('analyticsRefresh')?.addEventListener('click', refreshRecent);
  for (const id of ['analyticsPlatform', 'analyticsAccount', 'analyticsFrom', 'analyticsUntil']) {
    byId(id)?.addEventListener('change', loadAnalytics);
  }
  try { await loadAccounts(); } catch { showStatus('Accounts could not be loaded.', true); }
  await loadAnalytics();
}
