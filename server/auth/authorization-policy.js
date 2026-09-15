import { ROLES } from './roles.js';

const EDITOR_PREFIXES = Object.freeze([
  '/api/posts',
  '/api/publications/',
  '/api/drafts',
  '/api/composer/',
  '/api/caption-templates',
  '/api/hashtag-collections',
  '/api/destination-groups'
]);

function hasPrefix(pathname, prefixes) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export function requiredRoleForRequest(method, pathname) {
  const verb = String(method ?? 'GET').trim().toUpperCase();
  const path = String(pathname ?? '').trim();

  if (path === '/api/auth/session' || path === '/api/auth/logout') return ROLES.VIEWER;
  if (path === '/api/users' || path.startsWith('/api/users/')) return ROLES.ADMIN;
  if (verb === 'GET' || verb === 'HEAD') return ROLES.VIEWER;

  if (verb === 'POST' && path === '/api/media/uploads') return ROLES.EDITOR;
  if (verb === 'DELETE' && path.startsWith('/api/media/')) return ROLES.MANAGER;
  if (path.startsWith('/api/oauth/') || path.startsWith('/api/accounts/')) return ROLES.MANAGER;
  if (path === '/api/analytics/refresh' || /^\/api\/analytics\/publications\/[^/]+\/refresh$/.test(path)) return ROLES.MANAGER;
  if (path.startsWith('/api/whatsapp')) return ROLES.MANAGER;
  if (hasPrefix(path, EDITOR_PREFIXES)) return ROLES.EDITOR;

  return ROLES.ADMIN;
}
