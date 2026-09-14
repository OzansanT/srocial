import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexUrl=new URL('../client/index.html', import.meta.url);
const accountsApiUrl=new URL('../client/js/api/accounts-api.js', import.meta.url);
const accountsPageUrl=new URL('../client/js/pages/accounts.js', import.meta.url);
const composerUrl=new URL('../client/js/pages/composer.js', import.meta.url);

test('dashboard exposes TikTok OAuth and explicit Direct Post controls without a privacy default', async () => {
  const html=await readFile(indexUrl,'utf8');
  assert.match(html,/id="connect-tiktok"/);
  assert.match(html,/id="tiktok-publishing-options"/);
  assert.match(html,/name="tiktok:privacyLevel"/);
  assert.match(html,/name="tiktok:allowComment"/);
  assert.match(html,/name="tiktok:allowDuet"/);
  assert.match(html,/name="tiktok:allowStitch"/);
  assert.match(html,/name="tiktok:brandOrganic"/);
  assert.match(html,/name="tiktok:brandContent"/);
  assert.match(html,/name="tiktok:isAigc"/);
  assert.match(html,/name="tiktok:consent"/);
  assert.match(html,/Music Usage Confirmation/i);
  assert.doesNotMatch(html,/name="tiktok:privacyLevel"[^>]*value="(?:PUBLIC_TO_EVERYONE|MUTUAL_FOLLOW_FRIENDS|FOLLOWER_OF_CREATOR|SELF_ONLY)"/);
});

test('browser API exposes authenticated creator-info lookup', async () => {
  const source=await readFile(accountsApiUrl,'utf8');
  assert.match(source,/export function getTikTokCreatorInfo/);
  assert.match(source,/\/tiktok\/creator-info/);
});

test('accounts page enables TikTok through the shared OAuth path', async () => {
  const source=await readFile(accountsPageUrl,'utf8');
  assert.match(source,/OAUTH_ENABLED_PROVIDERS[^\n]*tiktok/);
  assert.match(source,/tiktok:\s*'#connect-tiktok'/);
});

test('composer fetches current TikTok creator capabilities and avoids innerHTML rendering', async () => {
  const source=await readFile(composerUrl,'utf8');
  assert.match(source,/getTikTokCreatorInfo/);
  assert.match(source,/privacyLevelOptions/);
  assert.match(source,/commentDisabled/);
  assert.match(source,/duetDisabled/);
  assert.match(source,/stitchDisabled/);
  assert.doesNotMatch(source,/\.innerHTML\s*=/);
});
