import test from 'node:test';
import assert from 'node:assert/strict';
import { readAppAuthConfig } from '../server/auth/app-auth-config.js';

test('application auth is disabled by default with safe operational defaults', () => {
  const config = readAppAuthConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.username, 'admin');
  assert.equal(config.sessionTtlSeconds, 28800);
  assert.equal(config.secureCookies, false);
  assert.equal(config.publicOrigin, 'http://127.0.0.1:3000');
  assert.deepEqual(config.apiRateLimit, { windowMs: 60000, max: 120 });
  assert.deepEqual(config.loginRateLimit, { windowMs: 900000, max: 10 });
});

test('enabled auth requires a strong administrator password', () => {
  assert.throws(
    () => readAppAuthConfig({
      APP_AUTH_ENABLED: 'true',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'too-short',
      SESSION_SECRET: 's'.repeat(32),
      PUBLIC_BASE_URL: 'https://example.com'
    }),
    (error) => error?.code === 'APP_AUTH_PASSWORD_WEAK'
  );
});

test('enabled auth requires a session secret with at least 32 characters', () => {
  assert.throws(
    () => readAppAuthConfig({
      APP_AUTH_ENABLED: 'true',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'correct-horse-battery',
      SESSION_SECRET: 'short-secret',
      PUBLIC_BASE_URL: 'https://example.com'
    }),
    (error) => error?.code === 'APP_AUTH_SESSION_SECRET_WEAK'
  );
});

test('enabled auth parses explicit limits and enables secure cookies for HTTPS', () => {
  const config = readAppAuthConfig({
    APP_AUTH_ENABLED: 'true',
    ADMIN_USERNAME: 'operator',
    ADMIN_PASSWORD: 'correct-horse-battery',
    SESSION_SECRET: 's'.repeat(40),
    SESSION_TTL_SECONDS: '3600',
    API_RATE_LIMIT_WINDOW_MS: '5000',
    API_RATE_LIMIT_MAX: '20',
    LOGIN_RATE_LIMIT_WINDOW_MS: '7000',
    LOGIN_RATE_LIMIT_MAX: '3',
    PUBLIC_BASE_URL: 'https://srocial.example.com/app'
  });
  assert.equal(config.enabled, true);
  assert.equal(config.username, 'operator');
  assert.equal(config.password, 'correct-horse-battery');
  assert.equal(config.sessionSecret, 's'.repeat(40));
  assert.equal(config.sessionTtlSeconds, 3600);
  assert.equal(config.secureCookies, true);
  assert.equal(config.publicOrigin, 'https://srocial.example.com');
  assert.deepEqual(config.apiRateLimit, { windowMs: 5000, max: 20 });
  assert.deepEqual(config.loginRateLimit, { windowMs: 7000, max: 3 });
});

test('enabled auth rejects invalid PUBLIC_BASE_URL and invalid positive integers', () => {
  assert.throws(
    () => readAppAuthConfig({
      APP_AUTH_ENABLED: 'true',
      ADMIN_PASSWORD: 'correct-horse-battery',
      SESSION_SECRET: 's'.repeat(40),
      PUBLIC_BASE_URL: 'not-a-url'
    }),
    (error) => error?.code === 'APP_AUTH_PUBLIC_BASE_URL_INVALID'
  );
  assert.throws(
    () => readAppAuthConfig({
      APP_AUTH_ENABLED: 'true',
      ADMIN_PASSWORD: 'correct-horse-battery',
      SESSION_SECRET: 's'.repeat(40),
      PUBLIC_BASE_URL: 'https://example.com',
      API_RATE_LIMIT_MAX: '0'
    }),
    (error) => error?.code === 'APP_AUTH_LIMIT_INVALID'
  );
});
