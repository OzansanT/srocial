import { getSession, logout } from './api/auth-api.js';
import { getDashboard, getHealth } from './api/dashboard-api.js';
import { initializeAccounts } from './pages/accounts.js';
import { initAnalyticsPage } from './pages/analytics.js';
import { initializeComposer } from './pages/composer.js';
import { initializeComposerWorkflows } from './pages/composer-workflows.js';
import { initializeMediaLibrary } from './pages/media-library.js';
import { initializeOperations } from './pages/operations.js';
import { initializeQueueCalendar } from './pages/queue-calendar.js';
import { initializeWhatsApp } from './pages/whatsapp.js';
import { renderDashboard } from './pages/dashboard.js';

let queueCalendar = { refresh: async () => {} };
let composerWorkflows = { markScheduled() {} };

async function refreshDashboardOnly() {
  renderDashboard(await getDashboard());
}

async function refreshPublishingData() {
  await Promise.all([refreshDashboardOnly(), queueCalendar.refresh()]);
}

async function initializeSessionControls() {
  const logoutButton = document.querySelector('#logout-session');
  if (!logoutButton) return;

  try {
    const session = await getSession();
    if (!session?.authenticated) {
      logoutButton.hidden = true;
      return;
    }
    logoutButton.hidden = false;
  } catch (error) {
    if (error?.status === 401) {
      window.location.replace('/login.html');
      return;
    }
    logoutButton.hidden = true;
    return;
  }

  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    try {
      await logout();
      window.location.replace('/login.html');
    } catch (error) {
      console.error('Logout failed', { status: error?.status ?? null });
      logoutButton.disabled = false;
    }
  });
}

async function bootstrap() {
  const statusText = document.querySelector('#service-status');
  const statusDot = document.querySelector('.status-dot');
  await initializeSessionControls();
  const composer = await initializeComposer({
    onScheduled: async () => {
      composerWorkflows.markScheduled();
      await refreshPublishingData();
    }
  });
  composerWorkflows = initializeComposerWorkflows({ composer });
  await initializeAccounts({ onChanged: composer.refreshAccounts });
  initializeMediaLibrary({ onUseMedia: composer.useMedia });
  initializeWhatsApp();
  initializeOperations();
  await initAnalyticsPage();
  queueCalendar = initializeQueueCalendar({ onChanged: refreshDashboardOnly });

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
