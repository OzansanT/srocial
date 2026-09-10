import { buildDashboardSummary } from '../services/dashboard-service.js';

export function getDashboardPayload() {
  return buildDashboardSummary();
}
