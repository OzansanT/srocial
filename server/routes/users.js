import { readJsonBody } from '../http/read-json-body.js';
import { createUserManagementService } from '../services/user-management-service.js';

const VALIDATION_ERRORS = new Set([
  'USERNAME_INVALID',
  'DISPLAY_NAME_INVALID',
  'ROLE_INVALID',
  'STATUS_INVALID',
  'PASSWORD_INVALID',
  'PASSWORD_LENGTH_INVALID',
  'USER_UPDATE_EMPTY'
]);

function mapError(error) {
  const code = error?.message;
  if (VALIDATION_ERRORS.has(code)) return { statusCode: 400, payload: { error: 'validation_error' } };
  if (code === 'USER_NOT_FOUND') return { statusCode: 404, payload: { error: 'not_found' } };
  if (code === 'USERNAME_CONFLICT') return { statusCode: 409, payload: { error: 'username_conflict' } };
  if (code === 'SELF_LOCKOUT_FORBIDDEN') return { statusCode: 409, payload: { error: 'self_lockout_forbidden' } };
  if (code === 'LAST_ADMIN_FORBIDDEN') return { statusCode: 409, payload: { error: 'last_admin_forbidden' } };
  return null;
}

async function invoke(work) {
  try {
    return await work();
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) return mapped;
    throw error;
  }
}

export async function routeUserManagementRequest({
  request,
  pathname,
  repository,
  actorUserId,
  now = new Date()
} = {}) {
  if (pathname !== '/api/users' && !String(pathname ?? '').startsWith('/api/users/')) return null;
  if (!repository) return { statusCode: 503, payload: { error: 'repository_unavailable' } };

  const service = createUserManagementService({ repository, now: () => new Date(now) });

  if (request.method === 'GET' && pathname === '/api/users') {
    return invoke(async () => ({ statusCode: 200, payload: { users: await service.listUsers() } }));
  }

  if (request.method === 'POST' && pathname === '/api/users') {
    return invoke(async () => ({
      statusCode: 201,
      payload: { user: await service.createUser(await readJsonBody(request)) }
    }));
  }

  const passwordMatch = pathname.match(/^\/api\/users\/([^/]+)\/password$/);
  if (request.method === 'POST' && passwordMatch) {
    return invoke(async () => {
      const body = await readJsonBody(request);
      const user = await service.changePassword(decodeURIComponent(passwordMatch[1]), body.password);
      return { statusCode: 200, payload: { user } };
    });
  }

  const revokeMatch = pathname.match(/^\/api\/users\/([^/]+)\/sessions\/revoke$/);
  if (request.method === 'POST' && revokeMatch) {
    return invoke(async () => {
      await readJsonBody(request);
      const result = await service.revokeSessions(decodeURIComponent(revokeMatch[1]));
      return { statusCode: 200, payload: result };
    });
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (request.method === 'PATCH' && userMatch) {
    return invoke(async () => ({
      statusCode: 200,
      payload: {
        user: await service.updateUser(
          decodeURIComponent(userMatch[1]),
          await readJsonBody(request),
          { actorUserId }
        )
      }
    }));
  }

  return { statusCode: 405, payload: { error: 'method_not_allowed' } };
}
