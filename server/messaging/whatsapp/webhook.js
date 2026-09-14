const STATUS_MAP = Object.freeze({
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED'
});

export function extractWhatsAppStatuses(payload) {
  const result = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== 'messages') continue;
      for (const status of Array.isArray(change?.value?.statuses) ? change.value.statuses : []) {
        const providerMessageId = String(status?.id ?? '').trim();
        const providerStatus = String(status?.status ?? '').trim().toLowerCase();
        const state = STATUS_MAP[providerStatus];
        if (!providerMessageId || !state) continue;
        const unixSeconds = Number(status?.timestamp);
        const occurredAt = Number.isFinite(unixSeconds)
          ? new Date(unixSeconds * 1000).toISOString()
          : null;
        result.push({
          providerMessageId,
          state,
          occurredAt,
          errorCode: state === 'FAILED' ? 'PROVIDER_ERROR' : null
        });
      }
    }
  }
  return result;
}
