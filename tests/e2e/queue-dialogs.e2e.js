import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchBrowser } from './browser-driver.js';
import { startSrocialE2EServer } from './srocial-server.js';

const FACEBOOK_ACCOUNT = Object.freeze({
  id: 'v27-queue-facebook-account',
  provider: 'facebook',
  providerAccountId: 'v27-queue-page',
  displayName: 'V27 Queue Facebook Page',
  username: 'v27_queue_page',
  state: 'CONNECTED'
});

const POST_ID = 'v27-queue-post';
const PUBLICATION_ID = 'v27-queue-publication';
const JOB_ID = 'v27-queue-job';
const RESCHEDULE_PROMPT = 'New local publish date/time (YYYY-MM-DDTHH:mm)';

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

function seedData() {
  const createdAt = new Date().toISOString();
  const scheduledAt = isoAfter(180);
  return {
    accounts: [{ ...FACEBOOK_ACCOUNT, createdAt, updatedAt: createdAt }],
    posts: [{
      id: POST_ID,
      caption: 'V27 queue browser edge post',
      scheduledAt,
      createdAt,
      updatedAt: createdAt
    }],
    publications: [{
      id: PUBLICATION_ID,
      postId: POST_ID,
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
    }],
    jobs: [{
      id: JOB_ID,
      type: 'SOCIAL_PUBLICATION',
      publicationId: PUBLICATION_ID,
      accountId: FACEBOOK_ACCOUNT.id,
      state: 'SCHEDULED',
      scheduledAt,
      attempts: 0,
      errorCode: null,
      lockedAt: null,
      lockedBy: null,
      createdAt,
      updatedAt: createdAt
    }]
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

async function runRescheduleDialog({ accept, promptText }) {
  const dialog = browser.handleNextDialog({
    accept,
    promptText,
    type: 'prompt',
    message: RESCHEDULE_PROMPT
  });
  const action = clickRowAction(POST_ID, 'Reschedule');
  const [details] = await Promise.all([dialog, action]);
  return details;
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

test('real browser handles accepted invalid and dismissed individual Reschedule prompts', { timeout: 25_000 }, async () => {
  await browser.navigate(`${server.baseUrl}/#queue`);
  await browser.waitFor(`document.querySelector('.queue-row[data-post-id=${JSON.stringify(POST_ID)}]') !== null`);

  const validInput = localInputAfter(360);
  const accepted = await runRescheduleDialog({ accept: true, promptText: validInput });
  assert.equal(accepted.type, 'prompt');
  assert.equal(accepted.message, RESCHEDULE_PROMPT);
  await browser.waitFor(`document.querySelector('#queue-feedback')?.textContent === 'Post rescheduled.'`, { timeoutMs: 8_000 });

  const expectedIso = await browser.evaluate(`new Date(${JSON.stringify(validInput)}).toISOString()`);
  const afterAccepted = await browserFetch('/api/posts');
  assert.equal(afterAccepted.status, 200);
  const acceptedSchedule = afterAccepted.body.posts.find((post) => post.id === POST_ID)?.scheduledAt;
  assert.equal(acceptedSchedule, expectedIso);

  const invalid = await runRescheduleDialog({ accept: true, promptText: 'not-a-date' });
  assert.equal(invalid.type, 'prompt');
  await browser.waitFor(`document.querySelector('#queue-feedback')?.textContent === 'Choose a valid date and time.'`);
  const afterInvalid = await browserFetch('/api/posts');
  assert.equal(afterInvalid.body.posts.find((post) => post.id === POST_ID)?.scheduledAt, acceptedSchedule);

  const dismissed = await runRescheduleDialog({ accept: false });
  assert.equal(dismissed.type, 'prompt');
  const afterDismissed = await browserFetch('/api/posts');
  assert.equal(afterDismissed.body.posts.find((post) => post.id === POST_ID)?.scheduledAt, acceptedSchedule);
});

test('real browser cancels one scheduled Queue post and renders the persisted terminal state', { timeout: 20_000 }, async () => {
  await browser.navigate(`${server.baseUrl}/#queue`);
  await browser.waitFor(`document.querySelector('.queue-row[data-post-id=${JSON.stringify(POST_ID)}]') !== null`);

  await clickRowAction(POST_ID, 'Cancel');
  await browser.waitFor(`document.querySelector('#queue-feedback')?.textContent === 'Post cancelled.'`, { timeoutMs: 8_000 });
  await browser.waitFor(`document.querySelector('.queue-row[data-post-id=${JSON.stringify(POST_ID)}] .queue-row__badges')?.textContent.includes('cancelled')`, { timeoutMs: 8_000 });

  const posts = await browserFetch('/api/posts');
  assert.equal(posts.status, 200);
  const post = posts.body.posts.find((item) => item.id === POST_ID);
  assert.equal(post?.publications?.[0]?.state, 'CANCELLED');
  assert.equal(post?.publications?.[0]?.jobs?.[0]?.state, 'CANCELLED');
});
