import { buildOperationsSummary } from '../services/operations-service.js';

export async function getOperationsPayload(repository) {
  if (!repository) return { statusCode:503, payload:{ error:'repository_unavailable' } };
  try {
    return { statusCode:200, payload:await buildOperationsSummary(repository) };
  } catch {
    return { statusCode:503, payload:{ error:'operations_unavailable' } };
  }
}
