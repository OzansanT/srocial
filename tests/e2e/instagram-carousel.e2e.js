import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchBrowser } from './browser-driver.js';
import { startSrocialE2EServer } from './srocial-server.js';

const INSTAGRAM = Object.freeze({
  id: 'e2e-instagram-account',
  provider: 'instagram',
  providerAccountId: 'e2e-instagram-professional-1',
  displayName: 'E2E Instagram Professional',
  username: 'e2e_instagram',
  state: 'CONNECTED'
});

const FIRST_MEDIA = 'https://media.example.test/carousel-1.jpg';
const SECOND_MEDIA = 'https://media.example.test/carousel-2.jpg';
const CAPTION = 'V31 ordered carousel browser post';

let server;
let browser;

function localDateTimeAfter(minutes) {
  const date = new Date(Date.now() + minutes * 60_000);
  date.setSeconds(0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

async function browserFetch(pathname) {
  return browser.evaluate(`(async () => {
    const response = await fetch(${JSON.stringify(pathname)});
    let payload = null;
    try { payload = await response.json(); } catch {}
    return { status: response.status, payload };
  })()`);
}

before(async () => {
  server = await startSrocialE2EServer({ seedAccounts: [INSTAGRAM] });
  browser = await launchBrowser();
  await browser.navigate(`${server.baseUrl}/login.html`);
  await browser.fill('#admin-username', server.admin.username);
  await browser.fill('#admin-password', server.admin.password);
  await browser.submit('#admin-login-form');
  await browser.waitFor(`location.pathname === '/'`);
  await browser.waitFor(`document.querySelector('input[name="platform"][value="instagram"]')?.disabled === false`, { timeoutMs: 8_000 });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

test('real browser schedules an ordered two-image Instagram carousel', { timeout: 25_000 }, async () => {
  await browser.fill('#post-caption', CAPTION);
  await browser.fill('[name="account:instagram"]', INSTAGRAM.id);
  await browser.click('input[name="platform"][value="instagram"]');
  await browser.fill('#media-url', FIRST_MEDIA);
  await browser.click('#add-media-item');
  await browser.fill('#media-url-2', SECOND_MEDIA);
  await browser.fill('#scheduled-at', localDateTimeAfter(90));

  await browser.waitFor(`document.querySelector('#composer-media-count')?.textContent === '2/10 media items'`);
  await browser.waitFor(`document.querySelector('#compatibility-report')?.textContent === '1/1 destinations compatible with the current composer state.'`, { timeoutMs: 8_000 });

  await browser.submit('#social-composer');
  await browser.waitFor(`document.querySelector('#composer-feedback')?.textContent === 'Post scheduled.'`, { timeoutMs: 8_000 });

  const result = await browserFetch('/api/posts');
  assert.equal(result.status, 200);
  const post = result.payload?.posts?.find((item) => item.caption === CAPTION);
  assert.ok(post?.id);
  assert.deepEqual(post.media.map(({ type, url, sortOrder }) => ({ type, url, sortOrder })), [
    { type: 'image', url: FIRST_MEDIA, sortOrder: 0 },
    { type: 'image', url: SECOND_MEDIA, sortOrder: 1 }
  ]);
  assert.equal(post.destinations?.[0]?.platform, 'instagram');
  assert.equal(post.destinations?.[0]?.accountId, INSTAGRAM.id);
});