const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isSameOriginMutation(request, publicOrigin) {
  const method = String(request?.method ?? 'GET').toUpperCase();
  if (!MUTATION_METHODS.has(method)) return true;

  const expectedOrigin = normalizeOrigin(publicOrigin);
  if (!expectedOrigin) return false;

  const originHeader = request?.headers?.origin;
  if (originHeader !== undefined && originHeader !== null && String(originHeader).trim() !== '') {
    return normalizeOrigin(originHeader) === expectedOrigin;
  }

  const fetchSite = String(request?.headers?.['sec-fetch-site'] ?? '').trim().toLowerCase();
  if (!fetchSite) return true;
  return fetchSite === 'same-origin' || fetchSite === 'none';
}
