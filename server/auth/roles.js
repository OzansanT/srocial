export const ROLES = Object.freeze({
  VIEWER: 'VIEWER',
  EDITOR: 'EDITOR',
  MANAGER: 'MANAGER',
  ADMIN: 'ADMIN'
});

const ROLE_RANK = Object.freeze({
  [ROLES.VIEWER]: 0,
  [ROLES.EDITOR]: 1,
  [ROLES.MANAGER]: 2,
  [ROLES.ADMIN]: 3
});

export function normalizeRole(value) {
  const role = String(value ?? '').trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(ROLE_RANK, role)) throw new Error('ROLE_INVALID');
  return role;
}

export function roleAtLeast(actual, required) {
  try {
    return ROLE_RANK[normalizeRole(actual)] >= ROLE_RANK[normalizeRole(required)];
  } catch {
    return false;
  }
}
