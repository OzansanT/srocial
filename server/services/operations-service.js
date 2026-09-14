const SOCIAL_PROVIDERS = Object.freeze(['instagram', 'facebook', 'threads', 'tiktok']);
const FAILED_JOB_STATES = new Set(['FAILED', 'RETRYING']);

function sortRecent(items, key) {
  return [...items].sort((a, b) => Date.parse(b?.[key] ?? '') - Date.parse(a?.[key] ?? ''));
}

function providerSnapshot(provider, existing) {
  return {
    provider,
    healthState: existing?.healthState ?? 'UNKNOWN',
    lastSuccessAt: existing?.lastSuccessAt ?? null,
    lastErrorAt: existing?.lastErrorAt ?? null,
    lastErrorCode: existing?.lastErrorCode ?? null,
    limitedUntil: existing?.limitedUntil ?? null,
    updatedAt: existing?.updatedAt ?? null
  };
}

function sanitizeJob(job) {
  return {
    id: job.id,
    type: job.type,
    publicationId: job.publicationId ?? null,
    accountId: job.accountId ?? null,
    state: job.state,
    scheduledAt: job.scheduledAt,
    attempts: Number(job.attempts ?? 0),
    errorCode: job.errorCode ?? null,
    updatedAt: job.updatedAt ?? null
  };
}

function sanitizeAttempt(attempt) {
  return {
    id: attempt.id,
    publicationId: attempt.publicationId,
    attempt: Number(attempt.attempt ?? 0),
    state: attempt.state,
    providerErrorCode: attempt.providerErrorCode ?? null,
    startedAt: attempt.startedAt ?? null,
    finishedAt: attempt.finishedAt ?? null
  };
}

function sanitizeWebhook(event) {
  return {
    id: event.id,
    provider: event.provider,
    eventType: event.eventType,
    signatureValid: event.signatureValid === true,
    processingState: event.processingState ?? 'RECEIVED',
    errorCode: event.errorCode ?? null,
    receivedAt: event.receivedAt ?? null,
    processedAt: event.processedAt ?? null
  };
}

export async function buildOperationsSummary(repository, { jobLimit = 25, attemptLimit = 50, webhookLimit = 50 } = {}) {
  const [providerStatuses, jobs, attempts, webhooks] = await Promise.all([
    repository.listProviderStatuses(),
    repository.listJobs(),
    repository.listPublicationAttempts({ limit: attemptLimit }),
    repository.listWebhookEvents({ limit: webhookLimit })
  ]);

  const statusMap = new Map(providerStatuses.map((item) => [String(item.provider).toLowerCase(), item]));
  return {
    providers: SOCIAL_PROVIDERS.map((provider) => providerSnapshot(provider, statusMap.get(provider))),
    failedJobs: sortRecent(jobs.filter((job) => FAILED_JOB_STATES.has(job.state)), 'updatedAt').slice(0, jobLimit).map(sanitizeJob),
    attempts: sortRecent(attempts, 'startedAt').slice(0, attemptLimit).map(sanitizeAttempt),
    webhooks: sortRecent(webhooks, 'receivedAt').slice(0, webhookLimit).map(sanitizeWebhook)
  };
}
