import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('dashboard exposes dedicated WhatsApp navigation, panel targets, stylesheet and page bootstrap', async () => {
  const [html, app] = await Promise.all([text('client/index.html'), text('client/js/app.js')]);
  assert.match(html, /href="#whatsapp"/);
  assert.match(html, /id="whatsapp"/);
  assert.match(html, /css\/pages\/whatsapp\.css/);
  assert.match(html, /id="whatsapp-contact-form"/);
  assert.match(html, /id="whatsapp-template-list"/);
  assert.match(html, /id="whatsapp-campaign-form"/);
  assert.match(app, /initializeWhatsApp/);
});

test('WhatsApp browser code uses dedicated API/page modules and avoids innerHTML rendering', async () => {
  const [api, page] = await Promise.all([
    text('client/js/api/whatsapp-api.js'),
    text('client/js/pages/whatsapp.js')
  ]);
  assert.match(api, /\/api\/whatsapp\/contacts/);
  assert.match(api, /\/api\/whatsapp\/templates\/sync/);
  assert.match(api, /\/api\/whatsapp\/campaigns/);
  assert.doesNotMatch(page, /innerHTML/);
  assert.match(page, /createElement/);
});
