function clean(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeVersion(value) {
  const normalized = clean(value) ?? 'v26.0';
  return normalized.startsWith('v') ? normalized : `v${normalized}`;
}

function parseBoolean(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

export function getWhatsAppConfig(env = process.env) {
  const accessToken = clean(env.WHATSAPP_ACCESS_TOKEN);
  const phoneNumberId = clean(env.WHATSAPP_PHONE_NUMBER_ID);
  const businessAccountId = clean(env.WHATSAPP_BUSINESS_ACCOUNT_ID);
  const verifyToken = clean(env.WHATSAPP_VERIFY_TOKEN);
  const appSecret = clean(env.WHATSAPP_APP_SECRET);
  if (!accessToken || !phoneNumberId || !businessAccountId || !verifyToken || !appSecret) return null;

  return {
    accessToken,
    phoneNumberId,
    businessAccountId,
    verifyToken,
    appSecret,
    graphApiVersion: normalizeVersion(env.WHATSAPP_GRAPH_API_VERSION),
    allowRealWhatsApp: parseBoolean(env.ALLOW_REAL_WHATSAPP)
  };
}
