import { getDashboard, getHealth } from './api/dashboard-api.js';
import { listPosts } from './api/posts-api.js';
import { initializeAccounts } from './pages/accounts.js';
import { initializeComposer } from './pages/composer.js';
import { initializeMediaLibrary } from './pages/media-library.js';
import { renderDashboard, renderScheduledPosts } from './pages/dashboard.js';

async function refreshPublishingData() {
  const [dashboard, posts] = await Promise.all([getDashboard(), listPosts()]);
  renderDashboard(dashboard);
  renderScheduledPosts(posts.posts ?? []);
}

async function bootstrap() {
  const statusText = document.querySelector('#service-status');
  const statusDot = document.querySelector('.status-dot');
  const composer = await initializeComposer({ onScheduled: refreshPublishingData });
  await initializeAccounts({ onChanged: composer.refreshAccounts });
  initializeMediaLibrary({ onUseMedia: composer.useMedia });

  try {
    const health = await getHealth();
    await refreshPublishingData();
    if (statusText) statusText.textContent = health.ok ? 'Service online' : 'Service degraded';
    if (statusDot && health.ok) statusDot.dataset.status = 'ok';
  } catch (error) {
    console.error(error);
    if (statusText) statusText.textContent = 'Service unavailable';
  }
}

bootstrap();
