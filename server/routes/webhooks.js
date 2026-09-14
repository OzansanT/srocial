import { processMetaWebhook, processTikTokWebhook, parseWebhookJson } from '../webhooks/processor.js';
import { verifyMetaSignature, verifyTikTokSignature } from '../webhooks/signatures.js';

export function handleMetaChallenge({ mode, verifyToken, challenge, expectedToken } = {}) {
  const configured = String(expectedToken ?? '');
  if (!configured) return { statusCode:503, payload:{ error:'webhook_not_configured' } };
  if (String(mode ?? '') !== 'subscribe' || String(verifyToken ?? '') !== configured || !String(challenge ?? '')) {
    return { statusCode:403, payload:{ error:'webhook_verification_failed' } };
  }
  return { statusCode:200, text:String(challenge) };
}

export async function handleMetaWebhook({ repository, rawBody, signature, appSecret, now = new Date() } = {}) {
  if (!String(appSecret ?? '')) return { statusCode:503, payload:{ error:'webhook_not_configured' } };
  if (!verifyMetaSignature({ rawBody, signature, secret:appSecret })) return { statusCode:401, payload:{ error:'invalid_signature' } };
  const payload = parseWebhookJson(rawBody);
  if (!payload) return { statusCode:400, payload:{ error:'invalid_json' } };
  const result = await processMetaWebhook({ repository, rawBody, payload, now });
  return { statusCode:200, payload:{ received:true, duplicate:result.duplicate === true } };
}

export async function handleTikTokWebhook({ repository, rawBody, signature, clientSecret, now = new Date() } = {}) {
  if (!String(clientSecret ?? '')) return { statusCode:503, payload:{ error:'webhook_not_configured' } };
  if (!verifyTikTokSignature({ rawBody, signature, secret:clientSecret, now })) return { statusCode:401, payload:{ error:'invalid_signature' } };
  const payload = parseWebhookJson(rawBody);
  if (!payload) return { statusCode:400, payload:{ error:'invalid_json' } };
  const result = await processTikTokWebhook({ repository, rawBody, payload, now });
  return {
    statusCode:200,
    payload:{ received:true, duplicate:result.duplicate === true, ...(result.errorCode ? { error:result.errorCode.toLowerCase() } : {}) }
  };
}
