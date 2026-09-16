const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRATION_WARNING_DAYS = 30;

function parseExpiry(value) {
  const milliseconds = Date.parse(value ?? '');
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function reconnectReason(account, nowMs, expiryMs) {
  if (account?.lastErrorCode === 'PERMISSION_REVOKED') return 'permission_revoked';
  if (
    account?.state === 'EXPIRED' ||
    account?.lastErrorCode === 'AUTH_ERROR' ||
    (account?.state === 'CONNECTED' && expiryMs !== null && expiryMs <= nowMs)
  ) return 'expired';
  if (account?.state === 'DISCONNECTED') return 'disconnected';
  if (account?.state === 'ERROR') return 'error';
  return null;
}

export function deriveAccountHealth(account, { now = new Date() } = {}) {
  const nowMs = now.getTime();
  const expiryMs = parseExpiry(account?.tokenExpiresAt);
  const expiresInDays = expiryMs === null
    ? null
    : Math.max(0, Math.ceil((expiryMs - nowMs) / DAY_MS));
  const reason = reconnectReason(account, nowMs, expiryMs);

  if (reason) {
    return {
      healthState:'RECONNECT_NEEDED',
      reconnectNeeded:true,
      reconnectReason:reason,
      expiresInDays,
      expirationWarning:false
    };
  }

  if (account?.state === 'CONNECTING') {
    return {
      healthState:'CONNECTING',
      reconnectNeeded:false,
      reconnectReason:null,
      expiresInDays,
      expirationWarning:false
    };
  }

  const expirationWarning = account?.state === 'CONNECTED' &&
    expiresInDays !== null &&
    expiresInDays <= EXPIRATION_WARNING_DAYS;

  return {
    healthState:expirationWarning ? 'EXPIRING' : 'CONNECTED',
    reconnectNeeded:false,
    reconnectReason:null,
    expiresInDays,
    expirationWarning
  };
}
