import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameOriginMutation } from '../server/http/request-origin.js';

function request(method, headers = {}) {
  return { method, headers };
}

test('safe methods are accepted without browser origin metadata', () => {
  assert.equal(isSameOriginMutation(request('GET'), 'https://srocial.example.com'), true);
  assert.equal(isSameOriginMutation(request('HEAD'), 'https://srocial.example.com'), true);
});

test('matching Origin is accepted and foreign Origin is rejected for mutations', () => {
  assert.equal(isSameOriginMutation(request('POST', { origin: 'https://srocial.example.com' }), 'https://srocial.example.com'), true);
  assert.equal(isSameOriginMutation(request('DELETE', { origin: 'https://evil.example' }), 'https://srocial.example.com'), false);
  assert.equal(isSameOriginMutation(request('POST', { origin: 'not-a-url' }), 'https://srocial.example.com'), false);
});

test('Sec-Fetch-Site rejects explicit cross-site mutations when Origin is absent', () => {
  assert.equal(isSameOriginMutation(request('POST', { 'sec-fetch-site': 'cross-site' }), 'https://srocial.example.com'), false);
  assert.equal(isSameOriginMutation(request('POST', { 'sec-fetch-site': 'same-origin' }), 'https://srocial.example.com'), true);
  assert.equal(isSameOriginMutation(request('POST', { 'sec-fetch-site': 'none' }), 'https://srocial.example.com'), true);
});

test('non-browser clients without Origin or Sec-Fetch-Site remain compatible', () => {
  assert.equal(isSameOriginMutation(request('PATCH'), 'https://srocial.example.com'), true);
});
