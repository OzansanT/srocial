import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseEnvironment } from '../server/operations/environment-diagnostics.js';

function codes(result) {
  return new Set(result.issues.map((issue) => issue.code));
}

test('postgres configuration reports a missing database URL without exposing values', () => {
  const result = diagnoseEnvironment({ DATABASE_DRIVER: 'postgres' });
  assert.equal(result.ok, false);
  assert.ok(codes(result).has('DATABASE_URL_REQUIRED'));
  assert.ok(result.issues.every((issue) => ['error', 'warning'].includes(issue.severity)));
});

test('s3 storage reports every required missing setting', () => {
  const result = diagnoseEnvironment({ MEDIA_STORAGE_DRIVER: 's3' });
  const issueCodes = codes(result);
  assert.equal(result.ok, false);
  assert.ok(issueCodes.has('MEDIA_S3_ENDPOINT_REQUIRED'));
  assert.ok(issueCodes.has('MEDIA_S3_BUCKET_REQUIRED'));
  assert.ok(issueCodes.has('MEDIA_S3_ACCESS_KEY_ID_REQUIRED'));
  assert.ok(issueCodes.has('MEDIA_S3_SECRET_ACCESS_KEY_REQUIRED'));
  assert.ok(issueCodes.has('MEDIA_PUBLIC_BASE_URL_REQUIRED'));
});

test('partial provider and WhatsApp credentials are diagnosed while absent optional providers stay quiet', () => {
  const result = diagnoseEnvironment({
    INSTAGRAM_APP_ID: 'instagram-id-only',
    TIKTOK_CLIENT_SECRET: 'tiktok-secret-only',
    WHATSAPP_ACCESS_TOKEN: 'whatsapp-token-only'
  });
  const issueCodes = codes(result);
  assert.ok(issueCodes.has('INSTAGRAM_CONFIGURATION_INCOMPLETE'));
  assert.ok(issueCodes.has('TIKTOK_CONFIGURATION_INCOMPLETE'));
  assert.ok(issueCodes.has('WHATSAPP_CONFIGURATION_INCOMPLETE'));
  assert.equal([...issueCodes].some((code) => code.startsWith('FACEBOOK_')), false);
  assert.equal([...issueCodes].some((code) => code.startsWith('THREADS_')), false);
});

test('scheduler and execution-gate mismatches are reported', () => {
  const schedulerWithoutGate = diagnoseEnvironment({ SCHEDULER_ENABLED: 'true' });
  assert.ok(codes(schedulerWithoutGate).has('SCHEDULER_EXECUTION_GATE_REQUIRED'));

  const gateWithoutScheduler = diagnoseEnvironment({
    SCHEDULER_ENABLED: 'false',
    ALLOW_REAL_PUBLISH: 'true'
  });
  assert.ok(codes(gateWithoutScheduler).has('EXECUTION_ENABLED_SCHEDULER_DISABLED'));
});

test('enabled authentication reports missing password and session secret', () => {
  const result = diagnoseEnvironment({ APP_AUTH_ENABLED: 'true' });
  const issueCodes = codes(result);
  assert.equal(result.ok, false);
  assert.ok(issueCodes.has('ADMIN_PASSWORD_REQUIRED'));
  assert.ok(issueCodes.has('SESSION_SECRET_REQUIRED'));
});

test('external HTTP and externally reachable unauthenticated execution produce safe warnings', () => {
  const result = diagnoseEnvironment({
    PUBLIC_BASE_URL: 'http://srocial.example.test',
    APP_AUTH_ENABLED: 'false',
    ALLOW_REAL_PUBLISH: 'true',
    SCHEDULER_ENABLED: 'true'
  });
  const issueCodes = codes(result);
  assert.ok(issueCodes.has('PUBLIC_HTTPS_RECOMMENDED'));
  assert.ok(issueCodes.has('EXTERNAL_AUTH_DISABLED'));
});

test('diagnostics never serialize supplied secret or credential values', () => {
  const secrets = [
    'db-secret-value',
    's3-access-value',
    's3-secret-value',
    'admin-password-value',
    'session-secret-value',
    'token-encryption-value',
    'instagram-secret-value',
    'tiktok-secret-value',
    'whatsapp-token-value'
  ];
  const result = diagnoseEnvironment({
    DATABASE_DRIVER: 'postgres',
    DATABASE_URL: `postgres://user:${secrets[0]}@db.example.test/srocial`,
    MEDIA_STORAGE_DRIVER: 's3',
    MEDIA_S3_ENDPOINT: 'https://storage.example.test',
    MEDIA_S3_BUCKET: 'bucket',
    MEDIA_S3_ACCESS_KEY_ID: secrets[1],
    MEDIA_S3_SECRET_ACCESS_KEY: secrets[2],
    MEDIA_PUBLIC_BASE_URL: 'https://cdn.example.test',
    APP_AUTH_ENABLED: 'true',
    ADMIN_PASSWORD: secrets[3],
    SESSION_SECRET: secrets[4],
    TOKEN_ENCRYPTION_KEY: secrets[5],
    INSTAGRAM_APP_ID: 'instagram-id',
    INSTAGRAM_APP_SECRET: secrets[6],
    TIKTOK_CLIENT_KEY: 'tiktok-key',
    TIKTOK_CLIENT_SECRET: secrets[7],
    WHATSAPP_ACCESS_TOKEN: secrets[8],
    WHATSAPP_PHONE_NUMBER_ID: 'phone-id',
    WHATSAPP_BUSINESS_ACCOUNT_ID: 'business-id',
    WHATSAPP_VERIFY_TOKEN: 'verify-token',
    WHATSAPP_APP_SECRET: 'whatsapp-app-secret',
    PUBLIC_BASE_URL: 'https://srocial.example.test'
  });
  const serialized = JSON.stringify(result);
  for (const secret of secrets) assert.equal(serialized.includes(secret), false);
  for (const issue of result.issues) {
    assert.deepEqual(Object.keys(issue).sort(), ['code', 'message', 'setting', 'severity']);
  }
});
