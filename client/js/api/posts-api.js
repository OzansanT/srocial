import { requestJson } from './client.js';
export function listPosts() { return requestJson('/api/posts'); }
export function createPost(input) { return requestJson('/api/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }); }
