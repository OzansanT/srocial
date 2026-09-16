import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { launchBrowser } from './browser-driver.js';
import { startSrocialE2EServer } from './srocial-server.js';

const FACEBOOK = Object.freeze({
  id: 'e2e-facebook-account',
  provider: 'facebook',
  providerAccountId: 'e2e-page-1',
  displayName: 'E2E Facebook Page',
  username: 'e2e_page',
  state: 'CONNECTED'
});

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const MASTER_CAPTION = 'V23 master launch caption';
const FACEBOOK_CAPTION = 'V23 Facebook override';
const TEMPLATE_NAME = 'V23 launch template';
const HASHTAG_NAME = 'V23 brand tags';
const GROUP_NAME = 'V23 Facebook destination';

let server;
let browser;
let uploadDirectory;
let uploadPath;
let draftId;
let draftRevision;

function js(value) {
  return JSON.stringify(value);
}

function localDateTimeAfter(minutes) {
  const date = new Date(Date.now() + minutes * 60_000);
  date.setSeconds(0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

async function browserFetch(pathname, options = {}) {
  return browser.evaluate(`(async () => {
    const response = await fetch(${js(pathname)}, ${js(options)});
    let payload = null;
    try { payload = await response.json(); } catch {}
    return { status: response.status, payload };
  })()`);
}

async function login() {
  await browser.navigate(`${server.baseUrl}/login.html`);
  await browser.fill('#admin-username', server.admin.username);
  await browser.fill('#admin-password', server.admin.password);
  await browser.submit('#admin-login-form');
  await browser.waitFor(`location.pathname === '/'`);
  await browser.waitFor(`document.querySelector('#logout-session')?.hidden === false`);
  await browser.waitFor(`document.querySelector('input[name="platform"][value="facebook"]')?.disabled === false`, { timeoutMs: 8_000 });
}

async function chooseFacebook() {
  await browser.fill('[name="account:facebook"]', FACEBOOK.id);
  const checked = await browser.evaluate(`document.querySelector('input[name="platform"][value="facebook"]')?.checked === true`);
  if (!checked) await browser.click('input[name="platform"][value="facebook"]');
  await browser.waitFor(`document.querySelector('input[name="platform"][value="facebook"]')?.checked === true`);
}

async function optionValue(selectSelector, label) {
  return browser.evaluate(`(() => {
    const select = document.querySelector(${js(selectSelector)});
    const item = [...(select?.options ?? [])].find((option) => option.textContent === ${js(label)});
    return item?.value ?? null;
  })()`);
}

async function clickButtonWithin(containerSelector, label) {
  return browser.evaluate(`(() => {
    const container = document.querySelector(${js(containerSelector)});
    const button = [...(container?.querySelectorAll('button') ?? [])].find((item) => item.textContent === ${js(label)});
    if (!button) throw new Error('BUTTON_NOT_FOUND');
    button.click();
    return true;
  })()`);
}

before(async () => {
  uploadDirectory = await mkdtemp(path.join(os.tmpdir(), 'srocial-v23-upload-'));
  uploadPath = path.join(uploadDirectory, 'pixel.png');
  await writeFile(uploadPath, Buffer.from(PNG_BASE64, 'base64'));
  server = await startSrocialE2EServer({ seedAccounts: [FACEBOOK] });
  browser = await launchBrowser();
  await login();
});

after(async () => {
  await browser?.close();
  await server?.close();
  if (uploadDirectory) await rm(uploadDirectory, { recursive: true, force: true });
});

test('real browser persists, recovers and conflict-protects composer drafts and reusable content', { timeout: 35_000 }, async () => {
  await browser.fill('#draft-name', 'V23 content draft');
  await browser.fill('#post-caption', MASTER_CAPTION);
  await chooseFacebook();
  await browser.fill('[name="override:facebook:caption"]', FACEBOOK_CAPTION);
  await browser.fill('[name="override:facebook:mediaMode"]', 'none');
  await browser.fill('#scheduled-at', localDateTimeAfter(90));

  await browser.fill('#caption-template-name', TEMPLATE_NAME);
  await browser.click('#save-caption-template');
  await browser.waitFor(`[...document.querySelectorAll('#caption-template-selector option')].some((option) => option.textContent === ${js(TEMPLATE_NAME)})`);

  await browser.fill('#hashtag-collection-name', HASHTAG_NAME);
  await browser.fill('#hashtag-collection-tags', '#brand #launch #brand');
  await browser.click('#save-hashtag-collection');
  await browser.waitFor(`[...document.querySelectorAll('#hashtag-collection-selector option')].some((option) => option.textContent === ${js(HASHTAG_NAME)})`);

  await browser.fill('#destination-group-name', GROUP_NAME);
  await browser.click('#save-destination-group');
  await browser.waitFor(`[...document.querySelectorAll('#destination-group-selector option')].some((option) => option.textContent === ${js(GROUP_NAME)})`);

  await browser.waitFor(`document.querySelector('#draft-status')?.textContent.startsWith('Saved revision ')`, { timeoutMs: 8_000 });
  await browser.waitFor(`document.querySelector('#compatibility-report')?.textContent === '1/1 destinations compatible with the current composer state.'`, { timeoutMs: 8_000 });
  assert.equal(await browser.evaluate(`document.querySelectorAll('.platform-preview-card').length`), 1);
  assert.equal(await browser.evaluate(`document.querySelector('.platform-preview-card__platform')?.textContent`), 'facebook');
  assert.equal(await browser.evaluate(`document.querySelector('.platform-preview-card__media')?.textContent`), 'Text-only');
  assert.equal(await browser.evaluate(`document.querySelector('.platform-preview-card__caption')?.textContent`), FACEBOOK_CAPTION);

  const draftList = await browserFetch('/api/composer/drafts');
  assert.equal(draftList.status, 200);
  const saved = draftList.payload?.drafts?.find((draft) => draft.name === 'V23 content draft');
  assert.ok(saved?.id);
  draftId = saved.id;
  draftRevision = saved.revision;

  await browser.navigate(`${server.baseUrl}/`);
  await browser.waitFor(`[...document.querySelectorAll('#draft-selector option')].some((option) => option.value === ${js(draftId)})`, { timeoutMs: 8_000 });
  await browser.fill('#draft-selector', draftId);
  await browser.waitFor(`document.querySelector('#draft-status')?.textContent.startsWith('Loaded revision ')`);
  assert.equal(await browser.evaluate(`document.querySelector('#post-caption')?.value`), MASTER_CAPTION);
  assert.equal(await browser.evaluate(`document.querySelector('[name="account:facebook"]')?.value`), FACEBOOK.id);
  assert.equal(await browser.evaluate(`document.querySelector('input[name="platform"][value="facebook"]')?.checked`), true);
  assert.equal(await browser.evaluate(`document.querySelector('[name="override:facebook:caption"]')?.value`), FACEBOOK_CAPTION);
  assert.equal(await browser.evaluate(`document.querySelector('[name="override:facebook:mediaMode"]')?.value`), 'none');

  const external = await browserFetch(`/api/composer/drafts/${draftId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: draftRevision, caption: 'Persisted external edit' })
  });
  assert.equal(external.status, 200);
  assert.equal(external.payload?.draft?.revision, draftRevision + 1);

  await browser.fill('#post-caption', 'Local stale edit stays in browser');
  await browser.waitFor(`document.querySelector('#draft-status')?.textContent === 'Draft changed in another tab. Reload the saved draft before editing again.'`, { timeoutMs: 8_000 });
  assert.equal(await browser.evaluate(`document.querySelector('#post-caption')?.value`), 'Local stale edit stays in browser');

  await browser.fill('#draft-selector', '');
  await browser.fill('#draft-selector', draftId);
  await browser.waitFor(`document.querySelector('#draft-status')?.textContent === ${js(`Loaded revision ${draftRevision + 1}.`)}`);
  assert.equal(await browser.evaluate(`document.querySelector('#post-caption')?.value`), 'Persisted external edit');

  const templateId = await optionValue('#caption-template-selector', TEMPLATE_NAME);
  assert.ok(templateId);
  await browser.fill('#caption-template-selector', templateId);
  await browser.click('#apply-caption-template');
  await browser.waitFor(`document.querySelector('#post-caption')?.value === ${js(MASTER_CAPTION)}`);

  const hashtagId = await optionValue('#hashtag-collection-selector', HASHTAG_NAME);
  assert.ok(hashtagId);
  await browser.fill('#hashtag-collection-selector', hashtagId);
  await browser.click('#apply-hashtag-collection');
  await browser.waitFor(`document.querySelector('#post-caption')?.value.includes('#brand') && document.querySelector('#post-caption')?.value.includes('#launch')`);
  const captionAfterTags = await browser.evaluate(`document.querySelector('#post-caption')?.value`);
  assert.equal((captionAfterTags.match(/#brand/g) ?? []).length, 1);
  assert.equal((captionAfterTags.match(/#launch/g) ?? []).length, 1);

  await browser.click('#save-draft-now');
  await browser.waitFor(`document.querySelector('#draft-status')?.textContent.startsWith('Saved revision ')`, { timeoutMs: 8_000 });
});

test('real browser uploads, appends, removes and deletes local media through the Media Library', { timeout: 25_000 }, async () => {
  await browser.setFileInputFiles('#media-file', [uploadPath]);
  await browser.click('#upload-media');
  await browser.waitFor(`document.querySelector('#media-upload-feedback')?.textContent === 'Media uploaded locally. Configure a public HTTPS PUBLIC_BASE_URL before scheduling provider publishing.'`, { timeoutMs: 8_000 });

  const uploadedUrl = await browser.evaluate(`document.querySelector('#media-url')?.value`);
  assert.ok(uploadedUrl.startsWith(`${server.baseUrl}/media/`));

  await browser.click('#refresh-media-library');
  await browser.waitFor(`document.querySelectorAll('#media-library-list .media-card').length === 1`, { timeoutMs: 8_000 });
  assert.equal(await browser.evaluate(`document.querySelector('#media-storage-summary')?.textContent.includes('1 file')`), true);

  await clickButtonWithin('.media-card', 'Use in composer');
  await browser.waitFor(`document.querySelectorAll('#composer-media-items [data-composer-media-row]').length === 2`);
  assert.equal(await browser.evaluate(`document.querySelector('#media-url')?.value`), uploadedUrl);
  assert.equal(await browser.evaluate(`document.querySelector('#media-url-2')?.value`), uploadedUrl);
  assert.equal(await browser.evaluate(`location.hash`), '#create');

  await browser.click('#composer-media-items [data-composer-media-row]:nth-child(2) [data-remove-media]');
  await browser.waitFor(`document.querySelectorAll('#composer-media-items [data-composer-media-row]').length === 1`);
  await browser.fill('#media-url', '');
  await browser.evaluate(`window.confirm = () => true`);
  await browser.click('.media-card__delete');
  await browser.waitFor(`document.querySelectorAll('#media-library-list .media-card').length === 0`, { timeoutMs: 8_000 });
  await browser.waitFor(`document.querySelector('#media-library-feedback')?.textContent === 'Media deleted.'`);
});

test('real browser schedules text-only Facebook content and performs Queue/Calendar bulk lifecycle actions', { timeout: 30_000 }, async () => {
  const scheduleValue = localDateTimeAfter(75);
  const rescheduleValue = localDateTimeAfter(150);

  await browser.fill('#post-caption', 'V23 scheduled browser post');
  await chooseFacebook();
  await browser.fill('[name="override:facebook:caption"]', 'V23 scheduled Facebook copy');
  await browser.fill('[name="override:facebook:mediaMode"]', 'none');
  await browser.fill('#media-url', '');
  await browser.fill('#scheduled-at', scheduleValue);
  await browser.waitFor(`document.querySelector('#compatibility-report')?.textContent === '1/1 destinations compatible with the current composer state.'`, { timeoutMs: 8_000 });

  await browser.submit('#social-composer');
  await browser.waitFor(`document.querySelector('#composer-feedback')?.textContent === 'Post scheduled.'`, { timeoutMs: 8_000 });
  await browser.waitFor(`document.querySelectorAll('#scheduled-post-list .queue-row').length === 1`, { timeoutMs: 8_000 });
  await browser.waitFor(`document.querySelectorAll('#calendar-grid .calendar-post').length >= 1`, { timeoutMs: 8_000 });
  assert.equal(await browser.evaluate(`document.querySelector('.queue-row__caption')?.textContent`), 'V23 scheduled browser post');

  await browser.click('.queue-row__selection input');
  await browser.fill('#queue-bulk-time', rescheduleValue);
  await browser.click('#queue-bulk-reschedule');
  await browser.waitFor(`document.querySelector('#queue-feedback')?.textContent === '1 selected post rescheduled.'`, { timeoutMs: 8_000 });

  const postList = await browserFetch('/api/posts');
  assert.equal(postList.status, 200);
  const scheduledPost = postList.payload?.posts?.find((post) => post.caption === 'V23 scheduled browser post');
  assert.ok(scheduledPost?.id);
  assert.equal(scheduledPost.scheduledAt, new Date(rescheduleValue).toISOString());
  assert.equal(await browser.evaluate(`document.querySelectorAll('#calendar-grid .calendar-post').length >= 1`), true);

  await browser.click('.queue-row__selection input');
  await browser.click('#queue-bulk-cancel');
  await browser.waitFor(`document.querySelector('#queue-feedback')?.textContent === '1 selected post cancelled.'`, { timeoutMs: 8_000 });
  await browser.waitFor(`document.querySelector('.queue-row__badges')?.textContent.includes('cancelled')`, { timeoutMs: 8_000 });
  assert.equal(await browser.evaluate(`document.querySelector('.calendar-post__state')?.textContent`), 'cancelled');
});

test('real browser rejects invalid bulk reschedule input before any request changes state', { timeout: 15_000 }, async () => {
  await browser.click('.queue-row__selection input');
  await browser.fill('#queue-bulk-time', '');
  await browser.click('#queue-bulk-reschedule');
  await browser.waitFor(`document.querySelector('#queue-feedback')?.textContent === 'Choose a valid new publish time.'`);

  const postList = await browserFetch('/api/posts');
  const scheduledPost = postList.payload?.posts?.find((post) => post.caption === 'V23 scheduled browser post');
  assert.equal(scheduledPost?.state, 'CANCELLED');
});
