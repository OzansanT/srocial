import { getDashboard, getHealth } from './api/dashboard-api.js';
import { renderDashboard } from './pages/dashboard.js';

async function bootstrap() {
  const statusText = document.querySelector('#service-status');
  const statusDot = document.querySelector('.status-dot');

  try {
    const [health, dashboard] = await Promise.all([getHealth(), getDashboard()]);
    renderDashboard(dashboard);
    if (statusText) statusText.textContent = health.ok ? 'Service online' : 'Service degraded';
    if (statusDot && health.ok) statusDot.dataset.status = 'ok';
  } catch (error) {
    console.error(error);
    if (statusText) statusText.textContent = 'Service unavailable';
  }
}

bootstrap();
