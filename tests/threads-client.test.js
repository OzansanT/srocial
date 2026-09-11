import test from 'node:test';
import assert from 'node:assert/strict';
import { createThreadsClient, ThreadsProviderError } from '../server/platforms/threads/client.js';

test('Threads client uses graph.threads.net with bearer Graph requests and form posts', async () => {
  const calls=[];
  const client=createThreadsClient({apiVersion:'v1.0',fetchImpl:async(url,init)=>{
    calls.push({url,init}); return new Response('{"id":"ok"}',{status:200,headers:{'content-type':'application/json'}});
  }});
  await client.getGraph('/me',{accessToken:'threads-token',query:{fields:'id,username'}});
  await client.postGraph('/me/threads',{accessToken:'threads-token',body:{media_type:'TEXT',text:'Hello'}});
  await client.formPost('https://graph.threads.net/oauth/access_token',{client_id:'1',code:'x'});
  assert.equal(new URL(calls[0].url).origin,'https://graph.threads.net'); assert.equal(new URL(calls[0].url).pathname,'/v1.0/me');
  assert.equal(calls[0].init.headers.authorization,'Bearer threads-token');
  assert.equal(calls[1].init.method,'POST'); assert.match(calls[1].init.body,/media_type=TEXT/);
  assert.equal(calls[2].url,'https://graph.threads.net/oauth/access_token');
});

test('Threads client normalizes provider and transport failures without leaking bodies', async () => {
  const fixtures=[
    [401,{error:{code:190,message:'token secret'}},'AUTH_ERROR',false],
    [403,{error:{code:10}},'PERMISSION_DENIED',false],
    [429,{error:{code:4}},'RATE_LIMIT',true],
    [503,{error:{code:1}},'PROVIDER_ERROR',true]
  ];
  for(const [status,body,code,retryable] of fixtures){
    const client=createThreadsClient({fetchImpl:async()=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})});
    await assert.rejects(()=>client.getGraph('/me'),(error)=>{
      assert.equal(error instanceof ThreadsProviderError,true); assert.equal(error.code,code); assert.equal(error.retryable,retryable);
      assert.equal(String(error.message).includes('token secret'),false); return true;
    });
  }
  const network=createThreadsClient({fetchImpl:async()=>{throw new Error('socket secret');}});
  await assert.rejects(()=>network.getGraph('/me'),(error)=>error.code==='NETWORK_ERROR'&&error.retryable===true&&!String(error.message).includes('socket secret'));
});
