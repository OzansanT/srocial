import test from 'node:test';
import assert from 'node:assert/strict';
import { createThreadsPublishingAdapter } from '../server/platforms/threads/publish.js';

function fixture({ media=[] }={}){
  const calls=[];
  const client={
    async postGraph(path,options){calls.push({method:'post',path,options});return{id:path.endsWith('/threads_publish')?'thread-900':'container-100'};},
    async getGraph(path,options){calls.push({method:'get',path,options});return{id:'container-100',status:'FINISHED'};}
  };
  return{calls,client,resolveCredentials:async(accountId)=>({accountId,providerAccountId:'threads-1',accessToken:'threads-token'}),getMedia:async()=>media};
}

test('Threads requires account binding before provider or media calls',async()=>{
  let credentialCalls=0,mediaCalls=0;
  const adapter=createThreadsPublishingAdapter({client:{},resolveCredentials:async()=>{credentialCalls+=1;},getMedia:async()=>{mediaCalls+=1;return[];}});
  await assert.rejects(()=>adapter.publish({post:{id:'p1',caption:'x'},publication:{id:'pub1'}}),(error)=>error.code==='ACCOUNT_REQUIRED'&&error.retryable===false);
  assert.equal(credentialCalls,0);assert.equal(mediaCalls,0);
});

test('Threads publishes text through container then threads_publish',async()=>{
  const f=fixture(); const result=await createThreadsPublishingAdapter(f).publish({post:{id:'p1',caption:' Hello '},publication:{accountId:'acct1'}});
  assert.deepEqual(result,{status:'PUBLISHED',externalId:'thread-900',containerId:'container-100'});
  assert.equal(f.calls[0].path,'/me/threads'); assert.deepEqual(f.calls[0].options.body,{media_type:'TEXT',text:'Hello'});
  assert.equal(f.calls[1].path,'/container-100'); assert.equal(f.calls[1].options.query.fields,'id,status,error_message');
  assert.equal(f.calls[2].path,'/me/threads_publish'); assert.deepEqual(f.calls[2].options.body,{creation_id:'container-100'});
});

test('Threads publishes one image and one video with provider-specific URL fields',async()=>{
  for(const [media,expected] of [
    [{type:'image',url:'https://cdn.example/post.jpg'},{media_type:'IMAGE',image_url:'https://cdn.example/post.jpg',text:'Caption'}],
    [{type:'video',url:'https://cdn.example/reel.mp4'},{media_type:'VIDEO',video_url:'https://cdn.example/reel.mp4',text:'Caption'}]
  ]){
    const f=fixture({media:[media]});
    const result=await createThreadsPublishingAdapter(f).publish({post:{id:'p1',caption:'Caption'},publication:{accountId:'acct1'}});
    assert.equal(result.status,'PUBLISHED'); assert.deepEqual(f.calls[0].options.body,expected);
  }
});

test('Threads returns PROCESSING for IN_PROGRESS and getStatus publishes once FINISHED',async()=>{
  const f=fixture({media:[{type:'video',url:'https://cdn.example/reel.mp4'}]});
  f.client.getGraph=async(path,options)=>{f.calls.push({method:'get',path,options});return{id:'container-100',status:'IN_PROGRESS'};};
  const adapter=createThreadsPublishingAdapter(f);
  assert.deepEqual(await adapter.publish({post:{id:'p1',caption:'Video'},publication:{accountId:'acct1'}}),{status:'PROCESSING',externalId:'container-100'});
  f.client.getGraph=async(path,options)=>{f.calls.push({method:'get',path,options});return{id:'container-100',status:'FINISHED'};};
  assert.deepEqual(await adapter.getStatus({publication:{accountId:'acct1',externalId:'container-100'}}),{status:'PUBLISHED',externalId:'thread-900',containerId:'container-100'});
});

test('Threads maps ERROR/EXPIRED safely and accepts PUBLISHED status',async()=>{
  const f=fixture(); const adapter=createThreadsPublishingAdapter(f);
  f.client.getGraph=async()=>({id:'container-100',status:'ERROR',error_message:'provider detail'});
  assert.deepEqual(await adapter.getStatus({publication:{accountId:'acct1',externalId:'container-100'}}),{status:'FAILED',externalId:'container-100',errorCode:'MEDIA_ERROR'});
  f.client.getGraph=async()=>({id:'container-100',status:'EXPIRED'});
  assert.deepEqual(await adapter.getStatus({publication:{accountId:'acct1',externalId:'container-100'}}),{status:'FAILED',externalId:'container-100',errorCode:'MEDIA_EXPIRED'});
  f.client.getGraph=async()=>({id:'container-100',status:'PUBLISHED'});
  assert.deepEqual(await adapter.getStatus({publication:{accountId:'acct1',externalId:'container-100'}}),{status:'PUBLISHED',externalId:'container-100'});
});

test('Threads rejects empty text, multiple media and non-HTTPS media before HTTP',async()=>{
  for(const [caption,media] of [
    ['',[]],
    ['x',[{type:'image',url:'http://private.example/a.jpg'}]],
    ['x',[{type:'image',url:'https://cdn.example/a.jpg'},{type:'image',url:'https://cdn.example/b.jpg'}]]
  ]){
    const f=fixture({media});
    await assert.rejects(()=>createThreadsPublishingAdapter(f).publish({post:{id:'p1',caption},publication:{accountId:'acct1'}}),(error)=>error.code==='INVALID_MEDIA');
    assert.equal(f.calls.length,0);
  }
});
