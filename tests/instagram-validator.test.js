import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInstagramPublication } from '../server/platforms/instagram/validator.js';

async function invalid(media) { try { validateInstagramPublication({ post:{caption:'Caption'}, media }); assert.fail('expected INVALID_MEDIA'); } catch (error) { assert.equal(error.code,'INVALID_MEDIA'); assert.equal(error.retryable,false); } }
test('rejects missing or multiple media items', async () => { await invalid([]); await invalid([{type:'image',url:'https://cdn.example/a.jpg'},{type:'image',url:'https://cdn.example/b.jpg'}]); });
test('rejects non-https and unsupported media', async () => { await invalid([{type:'image',url:'http://cdn.example/a.jpg'}]); await invalid([{type:'document',url:'https://cdn.example/a.pdf'}]); await invalid([{type:'image',url:'not-a-url'}]); });
test('normalizes one image publication', () => { assert.deepEqual(validateInstagramPublication({ post:{caption:'  Hello  '}, media:[{type:'IMAGE',url:'https://cdn.example/a.jpg'}] }), {type:'image',url:'https://cdn.example/a.jpg',caption:'Hello'}); });
test('normalizes one video as Reel input', () => { assert.deepEqual(validateInstagramPublication({ post:{caption:''}, media:[{type:'video',url:'https://cdn.example/a.mp4'}] }), {type:'video',url:'https://cdn.example/a.mp4',caption:''}); });
