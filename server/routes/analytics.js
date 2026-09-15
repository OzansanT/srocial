function errorResponse(error) {
  const code = String(error?.code ?? 'PROVIDER_ERROR');
  const mapping = {
    ANALYTICS_FILTER_INVALID: [400, 'analytics_filter_invalid'],
    ANALYTICS_NOT_FOUND: [404, 'not_found'],
    ANALYTICS_ACCOUNT_NOT_FOUND: [404, 'not_found'],
    ANALYTICS_PUBLICATION_NOT_PUBLISHED: [409, 'analytics_publication_not_published'],
    ANALYTICS_PUBLICATION_INELIGIBLE: [409, 'analytics_publication_ineligible'],
    ANALYTICS_ACCOUNT_UNAVAILABLE: [409, 'analytics_account_unavailable'],
    ANALYTICS_NOT_CONFIGURED: [409, 'analytics_not_configured'],
    ANALYTICS_UNSUPPORTED_PROVIDER: [400, 'analytics_unsupported_provider'],
    AUTH_ERROR: [401, 'provider_auth_error'],
    PERMISSION_DENIED: [403, 'permission_denied'],
    RATE_LIMIT: [429, 'rate_limit'],
    NETWORK_ERROR: [502, 'provider_unavailable'],
    PROVIDER_ERROR: [502, 'provider_error']
  };
  const [statusCode, safeCode] = mapping[code] ?? [502, 'provider_error'];
  return { statusCode, payload: { error: safeCode } };
}

async function safe(action) {
  try { return await action(); }
  catch (error) { return errorResponse(error); }
}

export function getAnalyticsPayload(analyticsService, filters = {}) {
  return safe(async () => ({ statusCode: 200, payload: await analyticsService.report(filters) }));
}

export function refreshPublicationAnalyticsPayload(analyticsService, publicationId, { now } = {}) {
  return safe(async () => ({ statusCode: 200, payload: { snapshot: await analyticsService.refreshPublication(publicationId, { now }) } }));
}

export function refreshAnalyticsPayload(analyticsService, filters = {}, { now } = {}) {
  return safe(async () => ({ statusCode: 200, payload: await analyticsService.refreshRecent(filters, { now }) }));
}
