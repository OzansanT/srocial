import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchBrowser } from './browser-driver.js';
import { startSrocialE2EServer } from './srocial-server.js';

const NOW = '2026-09-15T09:00:00.000Z';

const FACEBOOK_ACCOUNT = Object.freeze({
  id: 'v24-facebook-account',
  provider: 'facebook',
  providerAccountId: 'v24-facebook-page',
  displayName: 'V24 Facebook Page',
  username: 'v24_page',
  state: 'CONNECTED',
  createdAt: NOW,
  updatedAt: NOW
});

const THREADS_ACCOUNT = Object.freeze({
  id: 'v24-threads-account',
  provider: 'threads',
  providerAccountId: 'v24-threads-user',
  displayName: 'V24 Threads Account',
  username: 'v24_threads',
  state: 'DISCONNECTED',
  createdAt: NOW,
  updatedAt: NOW
});

const WHATSAPP_TEMPLATE = Object.freeze({
  id: 'v24-whatsapp-template',
  providerTemplateId: 'provider-v24-template',
  accountId: null,
  name: 'v24_notice',
  language: 'en_US',
  category: 'UTILITY',
  status: 'APPROVED',
  createdAt: NOW,
  updatedAt: NOW
});

const ANALYTICS_POST = Object.freeze({
  id: 'v24-analytics-post',
  caption: 'V24 analytics browser post',
  scheduledAt: '2026-09-14T10:00:00.000Z',
  createdAt: '2026-09-14T09:00:00.000Z',
  updatedAt: '2026-09-14T10:05:00.000Z'
});

const ANALYTICS_PUBLICATION = Object.freeze({
  id: 'v24-analytics-publication',
  postId: ANALYTICS_POST.id,
  accountId: FACEBOOK_ACCOUNT.id,
  platform: 'facebook',
  state: 'PUBLISHED',
  scheduledAt: '2026-09-14T10:00:00.000Z',
  externalId: 'v24-external-post',
  externalUrl: 'https://example.invalid/v24-post',
  errorCode: null,
  createdAt: '2026-09-14T09:00:00.000Z',
  updatedAt: '2026-09-14T10:05:00.000Z'
});

const SEED_DATA = Object.freeze({
  accounts: [FACEBOOK_ACCOUNT, THREADS_ACCOUNT],
  whatsappTemplates: [WHATSAPP_TEMPLATE],
  posts: [ANALYTICS_POST],
  publications: [ANALYTICS_PUBLICATION],
  publicationMetricSnapshots: [
    {
      id: 'v24-snapshot-old',
      publicationId: ANALYTICS_PUBLICATION.id,
      accountId: FACEBOOK_ACCOUNT.id,
      provider: 'facebook',
      externalId: ANALYTICS_PUBLICATION.externalId,
      views: 100,
      reach: 80,
      likes: 10,
      comments: 2,
      shares: 3,
      saves: null,
      extraMetrics: {},
      capturedAt: '2026-09-14T11:00:00.000Z'
    },
    {
      id: 'v24-snapshot-latest',
      publicationId: ANALYTICS_PUBLICATION.id,
      accountId: FACEBOOK_ACCOUNT.id,
      provider: 'facebook',
      externalId: ANALYTICS_PUBLICATION.externalId,
      views: 150,
      reach: 120,
      likes: 14,
      comments: 4,
      shares: 5,
      saves: null,
      extraMetrics: {},
      capturedAt: '2026-09-14T12:00:00.000Z'
    }
  ],
  providerStatuses: [
    {
      id: 'v24-provider-status',
      provider: 'facebook',
      healthState: 'DEGRADED',
      lastSuccessAt: '2026-09-14T08:00:00.000Z',
      lastErrorAt: '2026-09-15T08:30:00.000Z',
      lastErrorCode: 'RATE_LIMIT',
      limitedUntil: '2026-09-16T10:00:00.000Z',
      updatedAt: '2026-09-15T08:30:00.000Z'
    }
  ],
  jobs: [
    {
      id: 'v24-failed-job',
      type: 'SOCIAL_PUBLISH',
      publicationId: ANALYTICS_PUBLICATION.id,
      accountId: FACEBOOK_ACCOUNT.id,
      state: 'FAILED',
      scheduledAt: '2026-09-15T08:00:00.000Z',
      attempts: 3,
      errorCode: 'PROVIDER_ERROR',
      createdAt: '2026-09-15T07:00:00.000Z',
      updatedAt: '2026-09-15T08:40:00.000Z'
    }
  ],
  publicationAttempts: [
    {
      id: 'v24-publication-attempt',
      publicationId: ANALYTICS_PUBLICATION.id,
      attempt: 2,
      state: 'FAILED',
      providerErrorCode: 'RATE_LIMIT',
      startedAt: '2026-09-15T08:20:00.000Z',
      finishedAt: '2026-09-15T08:21:00.000Z'
    }
  ],
  webhookEvents: [
    {
      id: 'v24-webhook-event',
      provider: 'facebook',
      eventType: 'feed',
      signatureValid: true,
      processingState: 'PROCESSED',
      errorCode: null,
      receivedAt: '2026-09-15T08:10:00.000Z',
      processedAt: '2026-09-15T08:10:01.000Z'
    }
  ]
});

let server;
let browser;

async function login() {
  await browser.navigate(`${server.baseUrl}/login.html`);
  await browser.fill('#admin-username', server.admin.username);
  await browser.fill('#admin-password', server.admin.password);
  await browser.submit('#admin-login-form');
  await browser.waitFor(`location.pathname === '/'`);
  await browser.waitFor(`document.querySelector('#logout-session')?.hidden === false`);
}

async function browserFetch(path, options = {}) {
  return browser.evaluate(`(async () => {
    const response = await fetch(${JSON.stringify(path)}, ${JSON.stringify(options)});
    let body = null;
    try { body = await response.json(); } catch {}
    return { status: response.status, body };
  })()`);
}

function localDateTimeAfter(minutes) {
  const date = new Date(Date.now() + minutes * 60_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

before(async () => {
  server = await startSrocialE2EServer({ seedData: SEED_DATA });
  browser = await launchBrowser();
  await login();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

test('real browser manages deterministic account state without live OAuth', async () => {
  await browser.navigate(`${server.baseUrl}/#accounts`);
  await browser.waitFor(`document.querySelectorAll('#account-list .account-row').length === 2`);

  const initial = await browser.evaluate(`(() => {
    const rows = [...document.querySelectorAll('#account-list .account-row')];
    const facebook = rows.find((row) => row.textContent.includes('V24 Facebook Page'));
    const threads = rows.find((row) => row.textContent.includes('V24 Threads Account'));
    return {
      facebook: facebook?.textContent ?? '',
      threads: threads?.textContent ?? '',
      hasDisconnect: Boolean(facebook?.querySelector('button[data-action="disconnect"]')),
      hasReconnect: Boolean(facebook?.querySelector('button[data-action="reconnect"]')),
      threadsHasConnect: Boolean(threads?.querySelector('button[data-action="reconnect"]'))
    };
  })()`);
  assert.match(initial.facebook, /CONNECTED/);
  assert.match(initial.threads, /DISCONNECTED/);
  assert.equal(initial.hasDisconnect, true);
  assert.equal(initial.hasReconnect, true);
  assert.equal(initial.threadsHasConnect, true);

  await browser.click('button[data-action="disconnect"][data-account-id="v24-facebook-account"]');
  await browser.waitFor(`(() => {
    const row = [...document.querySelectorAll('#account-list .account-row')].find((item) => item.textContent.includes('V24 Facebook Page'));
    return row?.textContent.includes('DISCONNECTED') && !row.querySelector('button[data-action="disconnect"]');
  })()`);

  const accounts = await browserFetch('/api/accounts');
  assert.equal(accounts.status, 200);
  assert.equal(accounts.body.accounts.find((account) => account.id === FACEBOOK_ACCOUNT.id)?.state, 'DISCONNECTED');

  await browser.navigate(`${server.baseUrl}/?oauth=facebook&status=connected#accounts`);
  await browser.waitFor(`document.querySelector('#accounts-feedback')?.textContent === 'Facebook connected successfully.'`);
  const cleaned = await browser.evaluate(`({ search: location.search, hash: location.hash })`);
  assert.equal(cleaned.search, '');
  assert.equal(cleaned.hash, '#accounts');
});

test('real browser creates an opted-in WhatsApp contact and schedules a disabled-execution campaign', async () => {
  await browser.navigate(`${server.baseUrl}/#whatsapp`);
  await browser.waitFor(`document.querySelector('#whatsapp-campaign-template option[value="v24-whatsapp-template"]') !== null`);

  await browser.fill('#whatsapp-contact-form [name="phoneNumber"]', '+905551112233');
  await browser.fill('#whatsapp-contact-form [name="displayName"]', 'V24 WhatsApp Contact');
  await browser.fill('#whatsapp-contact-form [name="consentStatus"]', 'OPTED_IN');
  await browser.fill('#whatsapp-contact-form [name="consentSource"]', 'dashboard-e2e');
  await browser.submit('#whatsapp-contact-form');
  await browser.waitFor(`document.querySelector('#whatsapp-contact-list')?.textContent.includes('V24 WhatsApp Contact') && document.querySelector('#whatsapp-contact-list')?.textContent.includes('OPTED_IN')`);

  await browser.click('#whatsapp-contact-list input[name="whatsapp-recipient"]');
  await browser.fill('#whatsapp-campaign-form [name="name"]', 'V24 Browser Campaign');
  await browser.fill('#whatsapp-campaign-template', WHATSAPP_TEMPLATE.id);
  await browser.fill('#whatsapp-campaign-form [name="scheduledAt"]', localDateTimeAfter(120));
  await browser.submit('#whatsapp-campaign-form');
  await browser.waitFor(`document.querySelector('#whatsapp-campaign-list')?.textContent.includes('V24 Browser Campaign') && document.querySelector('#whatsapp-campaign-list')?.textContent.includes('SCHEDULED')`);

  const campaigns = await browserFetch('/api/whatsapp/campaigns');
  assert.equal(campaigns.status, 200);
  assert.equal(campaigns.body.campaigns.filter((campaign) => campaign.name === 'V24 Browser Campaign').length, 1);
  assert.equal(campaigns.body.campaigns.find((campaign) => campaign.name === 'V24 Browser Campaign')?.recipientSummary?.total, 1);

  await browser.evaluate(`(() => {
    const row = [...document.querySelectorAll('#whatsapp-contact-list .whatsapp-row')].find((item) => item.textContent.includes('V24 WhatsApp Contact'));
    row?.querySelector('button')?.click();
  })()`);
  await browser.waitFor(`document.querySelector('#whatsapp-contact-list')?.textContent.includes('OPTED_OUT') && document.querySelector('#whatsapp-contact-list input[name="whatsapp-recipient"]') === null`);
});

test('real browser renders seeded Operations provider, failure, attempt and webhook state', async () => {
  await browser.navigate(`${server.baseUrl}/#operations`);
  await browser.waitFor(`document.querySelector('#provider-health-list')?.textContent.includes('DEGRADED')`);
  await browser.waitFor(`document.querySelector('#failed-job-list')?.textContent.includes('SOCIAL_PUBLISH · FAILED')`);
  await browser.waitFor(`document.querySelector('#publication-attempt-list')?.textContent.includes('Attempt 2 · FAILED')`);
  await browser.waitFor(`document.querySelector('#webhook-event-list')?.textContent.includes('facebook · feed')`);

  const rendered = await browser.evaluate(`({
    provider: document.querySelector('#provider-health-list')?.textContent ?? '',
    failed: document.querySelector('#failed-job-list')?.textContent ?? '',
    attempts: document.querySelector('#publication-attempt-list')?.textContent ?? '',
    webhooks: document.querySelector('#webhook-event-list')?.textContent ?? ''
  })`);
  assert.match(rendered.provider, /Facebook/);
  assert.match(rendered.provider, /DEGRADED/);
  assert.match(rendered.failed, /PROVIDER_ERROR/);
  assert.match(rendered.attempts, /RATE_LIMIT/);
  assert.match(rendered.webhooks, /PROCESSED/);

  await browser.click('#refresh-operations');
  await browser.waitFor(`document.querySelector('#refresh-operations')?.disabled === false && document.querySelector('#operations-feedback')?.textContent === ''`);
  assert.match(await browser.evaluate(`document.querySelector('#provider-health-list')?.textContent ?? ''`), /DEGRADED/);
});

test('real browser renders and filters seeded Analytics snapshots', async () => {
  await browser.navigate(`${server.baseUrl}/#analytics`);
  await browser.waitFor(`document.querySelector('#analytics-status')?.textContent.includes('1 posts')`);
  await browser.waitFor(`document.querySelector('#analytics-posts')?.textContent.includes('V24 analytics browser post')`);

  const report = await browser.evaluate(`({
    kpis: document.querySelector('#analytics-kpis')?.textContent ?? '',
    posts: document.querySelector('#analytics-posts')?.textContent ?? '',
    status: document.querySelector('#analytics-status')?.textContent ?? ''
  })`);
  assert.match(report.kpis, /Views150/);
  assert.match(report.kpis, /Reach120/);
  assert.match(report.kpis, /Likes14/);
  assert.match(report.kpis, /Comments4/);
  assert.match(report.kpis, /Shares5/);
  assert.match(report.posts, /V24 analytics browser post/);
  assert.match(report.status, /1 posts/);

  await browser.fill('#analytics-platform', 'tiktok');
  await browser.waitFor(`document.querySelector('#analytics-status')?.textContent.includes('No analytics snapshots for this filter.')`);
  await browser.fill('#analytics-platform', 'facebook');
  await browser.waitFor(`document.querySelector('#analytics-status')?.textContent.includes('1 posts')`);
});
