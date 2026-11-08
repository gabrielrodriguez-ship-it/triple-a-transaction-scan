import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHandler, rateLimit } from '../lib/handler.mjs';
import { createTransport,ProviderError } from '../lib/providers.mjs';
import { InputError } from '../lib/errors.mjs';
const request=(body={},extra={})=>new Request('https://scan.example/api/lookup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),...extra});
test('API returns result and disables shared caching',async()=>{const response=await createHandler(async(input,network)=>({input,network}))(request({input:'abc'}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{input:'abc',network:'auto'});});
test('API rejects cross origin',async()=>assert.equal((await createHandler(async()=>({}))(request({}, {headers:{origin:'https://evil.test','content-type':'application/json'}}))).status,403));
test('API rejects non POST',async()=>assert.equal((await createHandler(async()=>({}))(new Request('https://scan.example/api/lookup'))).status,405));
test('API rejects wrong content type',async()=>assert.equal((await createHandler(async()=>({}))(request({}, {headers:{'content-type':'text/plain'}}))).status,415));
test('API rejects oversized body',async()=>assert.equal((await createHandler(async()=>({}))(request({input:'a'.repeat(17000)}))).status,413));
test('API rejects invalid JSON',async()=>assert.equal((await createHandler(async()=>({}))(request({}, {body:'{bad'}))).status,400));
test('API exposes only safe input errors',async()=>{const r=await createHandler(async()=>{throw new InputError('Invalid hash');})(request());assert.equal(r.status,400);assert.equal((await r.json()).error,'Invalid hash');});
test('API redacts provider exception and credentials',async()=>{const r=await createHandler(async()=>{throw Error('https://secret:password@provider.test/?api-key=secret');})(request());assert.equal(r.status,503);assert.ok(!(await r.text()).includes('secret'));});
test('API overload is retryable',async()=>{const r=await createHandler(async()=>{throw new ProviderError('BUSY');})(request());assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'5');});
test('production ingress rate limit configured',()=>{assert.equal(rateLimit.windowLimit,30);assert.equal(rateLimit.windowSize,60);assert.ok(rateLimit.aggregateBy.includes('ip'));});
test('transport preserves RPC null vs JSON RPC error',async()=>{const a=createTransport({fetcher:async()=>Response.json({result:null})});assert.equal(await a.rpc('https://rpc.test','method',[]),null);const b=createTransport({fetcher:async()=>Response.json({error:{code:-32000}})});await assert.rejects(b.rpc('https://rpc.test','method',[]),e=>e.code==='RPC_ERROR');});
test('transport respects rate limit cooldown without retry storm',async()=>{let count=0,time=0;const t=createTransport({now:()=>time,fetcher:async()=>{count++;return new Response('',{status:429,headers:{'retry-after':'2'}});}});await assert.rejects(t.json('https://provider.test'),e=>e.code==='RATE_LIMITED');await assert.rejects(t.json('https://provider.test'),e=>e.code==='RATE_LIMITED');assert.equal(count,1);time=2100;await assert.rejects(t.json('https://provider.test'));assert.equal(count,2);});
test('transport rejects malformed JSON',async()=>{const t=createTransport({fetcher:async()=>new Response('oops')});await assert.rejects(t.json('https://provider.test'),ProviderError);});
test('transport deadline includes response body parsing',async()=>{
 const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.flushHeaders();res.write('{');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const t=createTransport({timeoutMs:70});await assert.rejects(t.json('http://127.0.0.1:'+server.address().port),e=>e.code==='TIMEOUT');}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
