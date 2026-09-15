import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchBrowser } from './browser-driver.js';
import { startSrocialE2EServer } from './srocial-server.js';

const FACEBOOK_ACCOUNT = Object.freeze({
  id: 'v24-lifecycle-facebook-account',
  provider: 'facebook',
  providerAccountId: 'v24-lifecycle-page',
  displayName: 'V24 Lifecycle Facebook Page',
  username: 'v24_lifecycle_page',
  state: 'CONNECTED'
});

const SCHEDULED_POST_ID = 'v24-lifecycle-scheduled-post';
const SCHEDULED_PUBLICATION_ID = 'v24-lifecycle-scheduled-publication';
const SCHEDULED_JOB_ID = 'v24-lifecycle-scheduled-job';
const FAILED_POST_ID = 'v24-lifecycle-failed-post';
const FAILED_PUBLICATION_ID = 'v24-lifecycle-failed-publication';
const FAILED_JOB_ID = 'v24-lifecycle-failed-job';

let server;
let browser;

function isoAfter(minutes) {
  const date = new Date(Date.now() + minutes * 60_000);
  date.setSeconds(0, 0);
  return date.toISOString();
}

function localInputAfter(minutes) {
  const date = new Date(Date.now() + minutes * 60_000);
  date.setSeconds(0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function localDateKeyAfter(days) {
  const date = new Date(Date.now() + days * 24 * 60 * 60_000);
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function seedData() {
  const createdAt = new Date().toISOString();
  const scheduledAt = isoAfter(180);
  const failedAt = isoAfter(210);
  return {
    accounts: [{ ...FACEBOOK_ACCOUNT, createdAt, updatedAt: createdAt }],
    posts: [
      {
        id: SCHEDULED_POST_ID,
        caption: 'V24 editable scheduled post',
        scheduledAt,
        createdAt,
        updatedAt: createdAt
      },
      {
        id: FAILED_POST_ID,
        caption: 'V24 failed retry post',
        scheduledAt: failedAt,
        createdAt,
        updatedAt: createdAt
      }
    ],
    publications: [
      {
        id: SCHEDULED_PUBLICATION_ID,
        postId: SCHEDULED_POST_ID,
        accountId: FACEBOOK_ACCOUNT.id,
        platform: 'facebook',
        state: 'SCHEDULED',
        scheduledAt,
        providerOptions: {},
        captionOverride: null,
        mediaOverride: null,
        externalId: null,
        externalUrl: null,
        errorCode: null,
        createdAt,
        updatedAt: createdAt
      },
      {
        id: FAILED_PUBLICATION_ID,
        postId: FAILED_POST_ID,
        accountId: FACEBOOK_ACCOUNT.id,
        platform: 'facebook',
        state: 'FAILED',
        scheduledAt: failedAt,
        providerOptions: {},
        captionOverride: null,
        mediaOverride: null,
        externalId: null,
        externalUrl: null,
        errorCode: 'PROVIDER_ERROR',
        createdAt,
        updatedAt: createdAt
      }
    ],
    jobs: [
      {
        id: SCHEDULED_JOB_ID,
        type: 'SOCIAL_PUBLICATION',
        publicationId: SCHEDULED_PUBLICATION_ID,
        accountId: FACEBOOK_ACCOUNT.id,
        state: 'SCHEDULED',
        scheduledAt,
        attempts: 0,
        errorCode: null,
        lockedAt: null,
        lockedBy: null,
        createdAt,
        updatedAt: createdAt
      },
      {
        id: FAILED_JOB_ID,
        type: 'SOCIAL_PUBLICATION',
        publicationId: FAILED_PUBLICATION_ID,
        accountId: FACEBOOK_ACCOUNT.id,
        state: 'FAILED',
        scheduledAt: failedAt,
        attempts: 3,
        errorCode: 'PROVIDER_ERROR',
        lockedAt: null,
        lockedBy: null,
        createdAt,
        updatedAt: createdAt
      }
    ]
  };
}

async function login() {
  await browser.navigate(`${server.baseUrl}/login.html`);
  await browser.fill('#admin-username', server.admin.username);
  await browser.fill('#admin-password', server.admin.password);
  await browser.submit('#admin-login-form');
  await browser.waitFor(`location.pathname === '/'`);
  await browser.waitFor(`document.querySelector('#logout-session')?.hidden === false`);
}

async function browserFetch(pathname) {
  return browser.evaluate(`(async () => {
    const response = await fetch(${JSON.stringify(pathname)});
    let body = null;
    try { body = await response.json(); } catch {}
    return { status: response.status, body };
  })()`);
}

async function clickRowAction(postId, label) {
  return browser.evaluate(`(() => {
    const row = document.querySelector('.queue-row[data-post-id=${JSON.stringify(postId)}]');
    const button = [...(row?.querySelectorAll('button') ?? [])].find((item) => item.textContent === ${JSON.stringify(label)});
    if (!button) throw new Error('ROW_ACTION_NOT_FOUND');
    button.click();
    return true;
  })()`);
}

before(async () => {
  server = await startSrocialE2EServer({ seedData: seedData() });
  browser = await launchBrowser();
  await login();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

test('real browser filters Queue state and exercises edit duplicate and retry lifecycle actions', { timeout: 30_000 }, async () => {
  await browser.navigate(`${server.baseUrl}/#queue`);
  await browser.waitFor(`document.querySelectorAll('#scheduled-post-list .queue-row').length === 2`);

  await browser.fill('#queue-state-filter', 'FAILED');
  await browser.submit('#queue-filter-form');
  await browser.waitFor(`document.querySelectorAll('#scheduled-post-list .queue-row').length === 1 && document.querySelector('.queue-row')?.dataset.postId === ${JSON.stringify(FAILED_POST_ID)}`);

  await browser.fill('#queue-state-filter', 'SCHEDULED');
  await browser.submit('#queue-filter-form');
  await browser.waitFor(`document.querySelectorAll('#scheduled-post-list .queue-row').length === 1 && document.querySelector('.queue-row')?.dataset.postId === ${JSON.stringify(SCHEDULED_POST_ID)}`);

  await browser.fill('#queue-state-filter', '');
  await browser.submit('#queue-filter-form');
  await browser.waitFor(`document.querySelectorAll('#scheduled-post-list .queue-row').length === 2`);

  await browser.evaluate(`window.prompt = () => 'V24 edited caption'`);
  await clickRowAction(SCHEDULED_POST_ID, 'Edit caption');
  await browser.waitFor(`document.querySelector('#queue-feedback')?.textContent === 'Caption updated.'`);
  await browser.waitFor(`document.querySelector('.queue-row[data-post-id=${JSON.stringify(SCHEDULED_POST_ID)}] .queue-row__caption')?.textContent === 'V24 edited caption'`);

  const duplicateTime = localInputAfter(360);
  await browser.evaluate(`window.prompt = () => ${JSON.stringify(duplicateTime)}`);
  await clickRowAction(SCHEDULED_POST_ID, 'Duplicate');
  await browser.waitFor(`document.querySelector('#queue-feedback')?.textContent === 'Post duplicated.'`, { timeoutMs: 8_000 });
  await browser.waitFor(`document.querySelectorAll('#scheduled-post-list .queue-row').length === 3`, { timeoutMs: 8_000 });

  await clickRowAction(FAILED_POST_ID, 'Retry facebook');
  await browser.waitFor(`document.querySelector('#queue-feedback')?.textContent === 'facebook retry scheduled.'`, { timeoutMs: 8_000 });
  await browser.waitFor(`document.querySelector('.queue-row[data-post-id=${JSON.stringify(FAILED_POST_ID)}] .queue-row__badges')?.textContent.includes('scheduled')`, { timeoutMs: 8_000 });

  const posts = await browserFetch('/api/posts');
  assert.equal(posts.status, 200);
  assert.equal(posts.body.posts.find((post) => post.id === SCHEDULED_POST_ID)?.caption, 'V24 edited caption');
  assert.equal(posts.body.posts.filter((post) => post.caption === 'V24 edited caption').length, 2);
  assert.equal(posts.body.posts.find((post) => post.id === FAILED_POST_ID)?.publications?.[0]?.state, 'SCHEDULED');
});

test('real browser drag-reschedules a Calendar card onto another day', { timeout: 20_000 }, async () => {
  await browser.fill('#queue-state-filter', '');
  await browser.submit('#queue-filter-form');
  await browser.fill('#calendar-mode', 'month');

  const targetDate = localDateKeyAfter(3);
  await browser.waitFor(`document.querySelector('.calendar-post[data-post-id=${JSON.stringify(SCHEDULED_POST_ID)}]') !== null`);
  await browser.waitFor(`document.querySelector('.calendar-day[data-date=${JSON.stringify(targetDate)}]') !== null`);

  await browser.evaluate(`(() => {
    const card = document.querySelector('.calendar-post[data-post-id=${JSON.stringify(SCHEDULED_POST_ID)}]');
    const target = document.querySelector('.calendar-day[data-date=${JSON.stringify(targetDate)}]');
    if (!card || !target) throw new Error('CALENDAR_DRAG_TARGET_NOT_FOUND');
    const transfer = new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    card.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    return true;
  })()`);

  await browser.waitFor(`document.querySelector('#calendar-feedback')?.textContent === 'Post rescheduled from calendar.'`, { timeoutMs: 8_000 });
  await browser.waitFor(`document.querySelector('.calendar-day[data-date=${JSON.stringify(targetDate)}] .calendar-post[data-post-id=${JSON.stringify(SCHEDULED_POST_ID)}]') !== null`, { timeoutMs: 8_000 });

  const posts = await browserFetch('/api/posts');
  assert.equal(posts.status, 200);
  const scheduled = posts.body.posts.find((post) => post.id === SCHEDULED_POST_ID);
  assert.ok(scheduled?.scheduledAt);
  assert.equal(await browser.evaluate(`(() => {
    const date = new Date(${JSON.stringify(scheduled.scheduledAt)});
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  })()`), targetDate);
});
