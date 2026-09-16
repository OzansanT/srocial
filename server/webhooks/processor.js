import { createHash } from 'node:crypto';
import { recordProviderFailure, recordProviderSuccess } from '../operations/provider-telemetry.js';
import { extractWhatsAppStatuses } from '../messaging/whatsapp/webhook.js';

const WHATSAPP_STATE_RANK = Object.freeze({ SENDING: 0, SENT: 1, DELIVERED: 2, READ: 3 });

export function webhookFingerprint(rawBody) {
  return `sha256:${createHash('sha256').update(rawBody).digest('hex')}`;
}

export function parseWebhookJson(rawBody) {
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    return null;
  }
}

function parseContent(value) {
  if (value == null || value === '') return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function tiktokFailureCode(reason) {
  const value = String(reason ?? '').toLowerCase();
  if (/(file|format|media|photo|video|download|url)/.test(value)) return 'MEDIA_ERROR';
  return 'PROVIDER_ERROR';
}

async function beginEvent(repository, record) {
  const existing = await repository.getWebhookEventByExternalId(record.provider, record.externalEventId);
  if (existing) {
    if (existing.processingState === 'PROCESSED') return { duplicate: true, event: existing, resumed: false };
    return { duplicate: false, event: existing, resumed: true };
  }
  const event = await repository.createWebhookEvent(record);
  return { duplicate: false, event, resumed: false };
}

async function finishEvent(repository, event, now, patch = {}) {
  return repository.updateWebhookEvent(event.id, {
    processingState: 'PROCESSED',
    errorCode: null,
    processedAt: now.toISOString(),
    ...patch
  });
}

export async function processMetaWebhook({ repository, rawBody, payload, now = new Date() } = {}) {
  const externalEventId = webhookFingerprint(rawBody);
  const providerObject = String(payload?.object ?? 'unknown').trim().toLowerCase() || 'unknown';
  const started = await beginEvent(repository, {
    provider: 'meta',
    externalEventId,
    eventType: `meta.${providerObject}`,
    payload,
    signatureValid: true,
    processingState: 'RECEIVED',
    errorCode: null,
    receivedAt: now.toISOString(),
    processedAt: null
  });
  if (started.duplicate) return { duplicate: true };

  const provider = providerObject === 'instagram' ? 'instagram' : providerObject === 'page' ? 'facebook' : providerObject === 'threads' ? 'threads' : null;
  if (provider) await recordProviderSuccess(repository, provider, { now });
  await finishEvent(repository, started.event, now);
  return { duplicate: false };
}

export async function processTikTokWebhook({ repository, rawBody, payload, now = new Date() } = {}) {
  const externalEventId = webhookFingerprint(rawBody);
  const eventType = String(payload?.event ?? 'unknown').trim() || 'unknown';
  const started = await beginEvent(repository, {
    provider: 'tiktok',
    externalEventId,
    eventType,
    payload,
    signatureValid: true,
    processingState: 'RECEIVED',
    errorCode: null,
    receivedAt: now.toISOString(),
    processedAt: null
  });
  if (started.duplicate) return { duplicate: true };

  const content = parseContent(payload?.content);
  if (content == null) {
    await repository.updateWebhookEvent(started.event.id, {
      processingState: 'FAILED', errorCode: 'INVALID_CONTENT', processedAt: now.toISOString()
    });
    return { duplicate: false, errorCode: 'INVALID_CONTENT' };
  }

  if (eventType.startsWith('post.publish.')) {
    const publishId = String(content?.publish_id ?? '').trim();
    const publication = publishId ? await repository.findPublicationByExternalId('tiktok', publishId) : null;
    if (publication) {
      if (eventType === 'post.publish.failed') {
        const errorCode = tiktokFailureCode(content?.fail_reason);
        await repository.updatePublication(publication.id, {
          state: 'FAILED', errorCode, updatedAt: now.toISOString()
        });
        await recordProviderFailure(repository, 'tiktok', errorCode, { now });
      } else if (eventType === 'post.publish.complete' || eventType === 'post.publish.publicly_available') {
        await repository.updatePublication(publication.id, {
          state: 'PUBLISHED', errorCode: null, updatedAt: now.toISOString()
        });
        await recordProviderSuccess(repository, 'tiktok', { now });
      }
    } else {
      await recordProviderSuccess(repository, 'tiktok', { now });
    }
  } else if (eventType === 'authorization.removed') {
    const openId = String(payload?.user_openid ?? '').trim();
    const account = openId ? await repository.findAccountByProviderIdentity('tiktok', openId) : null;
    if (account) {
      await repository.updateAccount(account.id, {
        state: 'DISCONNECTED',
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        tokenExpiresAt: null,
        disconnectedAt: now.toISOString(),
        lastErrorCode: 'PERMISSION_REVOKED',
        updatedAt: now.toISOString()
      });
    }
  }

  await finishEvent(repository, started.event, now);
  return { duplicate: false };
}

function shouldAdvanceWhatsApp(currentState, nextState) {
  if (nextState === 'FAILED') return currentState !== 'READ';
  if (currentState === 'FAILED') return false;
  const currentRank = WHATSAPP_STATE_RANK[currentState] ?? -1;
  const nextRank = WHATSAPP_STATE_RANK[nextState] ?? -1;
  return nextRank >= currentRank;
}

export async function processWhatsAppWebhook({ repository, rawBody, payload, now = new Date() } = {}) {
  const externalEventId = webhookFingerprint(rawBody);
  const started = await beginEvent(repository, {
    provider: 'whatsapp',
    externalEventId,
    eventType: 'whatsapp.status',
    payload,
    signatureValid: true,
    processingState: 'RECEIVED',
    errorCode: null,
    receivedAt: now.toISOString(),
    processedAt: null
  });
  if (started.duplicate) return { duplicate: true };

  const statuses = extractWhatsAppStatuses(payload);
  for (const status of statuses) {
    const message = await repository.findWhatsAppMessageByProviderId(status.providerMessageId);
    if (!message || !shouldAdvanceWhatsApp(message.state, status.state)) continue;
    const at = status.occurredAt ?? now.toISOString();
    const patch = { state: status.state, errorCode: status.errorCode, updatedAt: now.toISOString() };
    if (status.state === 'SENT') patch.sentAt = at;
    if (status.state === 'DELIVERED') patch.deliveredAt = at;
    if (status.state === 'READ') patch.readAt = at;
    if (status.state === 'FAILED') patch.failedAt = at;
    await repository.updateWhatsAppMessage(message.id, patch);
    if (message.campaignRecipientId) {
      await repository.updateCampaignRecipient(message.campaignRecipientId, { state: status.state });
    }
    if (status.state === 'FAILED') await recordProviderFailure(repository, 'whatsapp', status.errorCode, { now });
    else await recordProviderSuccess(repository, 'whatsapp', { now });
  }

  await finishEvent(repository, started.event, now);
  return { duplicate: false, processed: statuses.length };
}
