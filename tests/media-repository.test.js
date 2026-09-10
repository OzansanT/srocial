import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createJsonRepository } from '../server/db/json-repository.js';

async function withRepo(run){const dir=await mkdtemp(join(tmpdir(),'srocial-media-'));const file=join(dir,'data.json');try{await run(file);}finally{await rm(dir,{recursive:true,force:true});}}
test('persists and lists media by post',async()=>{await withRepo(async(file)=>{const first=createJsonRepository({filePath:file});await first.initialize();await first.createMedia({postId:'p1',type:'image',url:'https://cdn.example/a.jpg',sortOrder:1});await first.createMedia({postId:'p2',type:'video',url:'https://cdn.example/b.mp4',sortOrder:0});await first.createMedia({postId:'p1',type:'image',url:'https://cdn.example/c.jpg',sortOrder:0});const second=createJsonRepository({filePath:file});await second.initialize();const media=await second.listMediaForPost('p1');assert.equal(media.length,2);assert.deepEqual(media.map((item)=>item.url),['https://cdn.example/c.jpg','https://cdn.example/a.jpg']);});});
test('loads legacy JSON without media collection',async()=>{await withRepo(async(file)=>{await writeFile(file,JSON.stringify({posts:[],publications:[],jobs:[],accounts:[],oauthStates:[]}),'utf8');const repository=createJsonRepository({filePath:file});await repository.initialize();assert.deepEqual(await repository.listMediaForPost('p1'),[]);});});
