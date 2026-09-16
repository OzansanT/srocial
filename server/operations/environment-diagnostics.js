function readValue(env, key) {
  return String(env?.[key] ?? '').trim();
}

function enabled(env, key) {
  return readValue(env, key).toLowerCase() === 'true';
}

function pushIssue(issues, code, severity, setting, message) {
  issues.push({ code, severity, setting, message });
}

function diagnosePair(issues, env, { code, keys, setting, message }) {
  const present = keys.map((key) => Boolean(readValue(env, key)));
  if (present.some(Boolean) && !present.every(Boolean)) {
    pushIssue(issues, code, 'warning', setting, message);
  }
}

function publicUrlState(value) {
  if (!value) return { valid: false, external: false, https: false };
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
    return { valid: true, external: !loopback, https: url.protocol === 'https:' };
  } catch {
    return { valid: false, external: false, https: false };
  }
}

export function diagnoseEnvironment(env = {}) {
  const issues = [];
  const databaseDriver = readValue(env, 'DATABASE_DRIVER').toLowerCase() || 'json';
  const mediaDriver = readValue(env, 'MEDIA_STORAGE_DRIVER').toLowerCase() || 'local';
  const schedulerEnabled = enabled(env, 'SCHEDULER_ENABLED');
  const realPublishEnabled = enabled(env, 'ALLOW_REAL_PUBLISH');
  const realWhatsAppEnabled = enabled(env, 'ALLOW_REAL_WHATSAPP');
  const anyRealExecution = realPublishEnabled || realWhatsAppEnabled;
  const authEnabled = enabled(env, 'APP_AUTH_ENABLED');

  if (databaseDriver === 'postgres' && !readValue(env, 'DATABASE_URL')) {
    pushIssue(issues, 'DATABASE_URL_REQUIRED', 'error', 'DATABASE_URL', 'PostgreSQL requires DATABASE_URL to be configured.');
  }

  if (mediaDriver === 's3') {
    const required = [
      ['MEDIA_S3_ENDPOINT', 'MEDIA_S3_ENDPOINT_REQUIRED'],
      ['MEDIA_S3_BUCKET', 'MEDIA_S3_BUCKET_REQUIRED'],
      ['MEDIA_S3_ACCESS_KEY_ID', 'MEDIA_S3_ACCESS_KEY_ID_REQUIRED'],
      ['MEDIA_S3_SECRET_ACCESS_KEY', 'MEDIA_S3_SECRET_ACCESS_KEY_REQUIRED'],
      ['MEDIA_PUBLIC_BASE_URL', 'MEDIA_PUBLIC_BASE_URL_REQUIRED']
    ];
    for (const [setting, code] of required) {
      if (!readValue(env, setting)) {
        pushIssue(issues, code, 'error', setting, `${setting} is required when S3 media storage is selected.`);
      }
    }
  }

  diagnosePair(issues, env, {
    code: 'INSTAGRAM_CONFIGURATION_INCOMPLETE',
    keys: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],
    setting: 'INSTAGRAM_APP_ID,INSTAGRAM_APP_SECRET',
    message: 'Instagram provider credentials must be configured together.'
  });
  diagnosePair(issues, env, {
    code: 'FACEBOOK_CONFIGURATION_INCOMPLETE',
    keys: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
    setting: 'FACEBOOK_APP_ID,FACEBOOK_APP_SECRET',
    message: 'Facebook provider credentials must be configured together.'
  });
  diagnosePair(issues, env, {
    code: 'THREADS_CONFIGURATION_INCOMPLETE',
    keys: ['THREADS_APP_ID', 'THREADS_APP_SECRET'],
    setting: 'THREADS_APP_ID,THREADS_APP_SECRET',
    message: 'Threads provider credentials must be configured together.'
  });
  diagnosePair(issues, env, {
    code: 'TIKTOK_CONFIGURATION_INCOMPLETE',
    keys: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    setting: 'TIKTOK_CLIENT_KEY,TIKTOK_CLIENT_SECRET',
    message: 'TikTok provider credentials must be configured together.'
  });

  const whatsappKeys = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_BUSINESS_ACCOUNT_ID',
    'WHATSAPP_VERIFY_TOKEN',
    'WHATSAPP_APP_SECRET'
  ];
  const whatsappPresence = whatsappKeys.map((key) => Boolean(readValue(env, key)));
  if (whatsappPresence.some(Boolean) && !whatsappPresence.every(Boolean)) {
    pushIssue(
      issues,
      'WHATSAPP_CONFIGURATION_INCOMPLETE',
      'warning',
      whatsappKeys.join(','),
      'WhatsApp Business credentials and webhook settings must be configured together.'
    );
  }

  if (schedulerEnabled && !anyRealExecution) {
    pushIssue(
      issues,
      'SCHEDULER_EXECUTION_GATE_REQUIRED',
      'warning',
      'ALLOW_REAL_PUBLISH,ALLOW_REAL_WHATSAPP',
      'The scheduler is enabled but no real execution gate is enabled.'
    );
  }
  if (!schedulerEnabled && anyRealExecution) {
    pushIssue(
      issues,
      'EXECUTION_ENABLED_SCHEDULER_DISABLED',
      'warning',
      'SCHEDULER_ENABLED',
      'A real execution gate is enabled while the scheduler is disabled.'
    );
  }

  const publicUrl = publicUrlState(readValue(env, 'PUBLIC_BASE_URL'));
  if (anyRealExecution && publicUrl.valid && publicUrl.external && !publicUrl.https) {
    pushIssue(
      issues,
      'PUBLIC_HTTPS_RECOMMENDED',
      'warning',
      'PUBLIC_BASE_URL',
      'External real execution should use an HTTPS public base URL.'
    );
  }
  if (anyRealExecution && publicUrl.valid && publicUrl.external && !authEnabled) {
    pushIssue(
      issues,
      'EXTERNAL_AUTH_DISABLED',
      'warning',
      'APP_AUTH_ENABLED',
      'Application authentication is disabled while real execution is configured on an external deployment.'
    );
  }

  if (authEnabled) {
    if (!readValue(env, 'ADMIN_PASSWORD')) {
      pushIssue(issues, 'ADMIN_PASSWORD_REQUIRED', 'error', 'ADMIN_PASSWORD', 'Enabled application authentication requires an administrator password.');
    }
    if (!readValue(env, 'SESSION_SECRET')) {
      pushIssue(issues, 'SESSION_SECRET_REQUIRED', 'error', 'SESSION_SECRET', 'Enabled application authentication requires a session secret.');
    }
  }

  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    issues
  };
}
