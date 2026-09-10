const RETRY_DELAYS_MS = Object.freeze([
  60_000,
  300_000,
  900_000,
  3_600_000
]);

const RETRYABLE_CODES = new Set([
  'NETWORK_ERROR',
  'RATE_LIMIT',
  'TIMEOUT',
  'TEMPORARY_PROVIDER_ERROR',
  'MEDIA_PROCESSING'
]);

export function getRetryDelayMs(attempt) {
  const normalizedAttempt = Math.max(1, Number.parseInt(attempt, 10) || 1);
  return RETRY_DELAYS_MS[Math.min(normalizedAttempt - 1, RETRY_DELAYS_MS.length - 1)];
}

export function classifyExecutionError(error) {
  const code = String(error?.code ?? 'PROVIDER_ERROR').trim().toUpperCase() || 'PROVIDER_ERROR';
  if (typeof error?.retryable === 'boolean') return { code, retryable: error.retryable };
  return { code, retryable: RETRYABLE_CODES.has(code) };
}
