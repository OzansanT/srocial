import { listAccounts } from './api/accounts-api.js';
import { getDashboard, getHealth } from './api/dashboard-api.js';
import { listPosts } from './api/posts-api.js';
import { initializeAccounts, renderAccounts } from './pages/accounts.js';
import { initializeComposer } from './pages/composer.js';
import { renderDashboard, renderScheduledPosts } from './pages/dashboard.js';

async function refreshPublishingData() {
  const [dashboard, posts] = await Promise.all([getDashboard(), listPosts()]);
  renderDashboard(dashboard);
  renderScheduledPosts(posts.posts ?? []);
}

async function refreshAccounts() {
  const payload = await listAccounts();
  renderAccounts(payload.accounts ?? []);
}

async function refreshAfterAccountChange() {
  await Promise.all([refreshAccounts(), refreshPublishingData()]);
}

async function bootstrap() {
  const statusText = document.querySelector('#service-status');
  const statusDot = document.querySelector('.status-dot');
  initializeComposer({ onScheduled: refreshPublishingData });
  initializeAccounts({ onChanged: refreshAfterAccountChange });
  try {
    const health = await getHealth();
    await Promise.all([refreshPublishingData(), refreshAccounts()]);
    if (statusText) statusText.textContent = health.ok ? 'Service online' : 'Service degraded';
    if (statusDot && health.ok) statusDot.dataset.status = 'ok';
  } catch (error) {
    console.error(error);
    if (statusText) statusText.textContent = 'Service unavailable';
  }
}

bootstrap();
