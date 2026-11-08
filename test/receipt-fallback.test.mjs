import test from 'node:test';
import {Interface} from 'ethers';
import assert from 'node:assert/strict';
import {createLookup} from '../lib/lookup.mjs';
import {createTransport,ProviderError} from '../lib/providers.mjs';
import {parseInput,CHAINS} from '../lib/input.mjs';
const hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64);
const signature='4ReKprwf3WdLHRrzp4ctPWNBsQDPL3VZz3zMmoZfcGJMJCHh5Vq937mPdyxhCbw54wNnA6hZ7KfNpQdpt13yY7A9';
const tx={hash,blockHash,blockNumber:'0x10',value:'0x1',gasPrice:'0x1',chainId:'0x1'};
const receipt={transactionHash:hash,blockHash,blockNumber:'0x10',status:'0x1',gasUsed:'0x5208',logs:[]};
function make(options={}){
 const calls=[];
 const transport={rpc:async(url,method,params)=>{
  calls.push({url,method,params});
  if(method==='eth_chainId')return options.wrongFallback && url!==CHAINS.ethereum.rpc[0]?'0x89':'0x1';
  if(method==='eth_getTransactionByHash')return {...tx};
  if(method==='eth_getTransactionReceipt')return options.direct?.(url) ?? null;
  if(method==='eth_getBlockReceipts')return options.blockReceipts ?? [receipt];
  if(method==='eth_blockNumber'){if(options.failEnrichment)throw new ProviderError();return '0x11';}
  if(method==='eth_getBlockByNumber'){if(options.failEnrichment)throw new ProviderError();return {hash:blockHash,timestamp:'0x6553f100'};}
  throw new ProviderError();
 }};
 return {service:createLookup({transport,env:{}}),calls,transport};
}
test('historical receipt is recovered from containing block',async()=>{const {service}=make();const r=await service.lookup(hash,'ethereum');assert.equal(r.onePage.summaryState,'RICH');assert.equal(r.onePage.fields.find(f=>f.key==='Status').value,'Confirmed');assert.equal(r.onePage.fields.find(f=>f.key==='Gas used').value,'21000');});
test('historical failed execution stays failed',async()=>{const {service}=make({blockReceipts:[{...receipt,status:'0x0'}]});const r=await service.lookup(hash,'ethereum');assert.equal(r.onePage.fields.find(f=>f.key==='Status').value,'Failed');});
test('receipt from a different transaction is rejected',async()=>{const {service}=make({blockReceipts:[{...receipt,transactionHash:'0x'+'c'.repeat(64)}]});assert.equal((await service.lookup(hash,'ethereum')).onePage.summaryState,'LIMITED');});
test('receipt from a different block is rejected',async()=>{const {service}=make({blockReceipts:[{...receipt,blockHash:'0x'+'c'.repeat(64)}]});assert.equal((await service.lookup(hash,'ethereum')).onePage.summaryState,'LIMITED');});
test('receipt with inconsistent block number is rejected',async()=>{const {service}=make({blockReceipts:[{...receipt,blockNumber:'0x11'}]});assert.equal((await service.lookup(hash,'ethereum')).onePage.summaryState,'LIMITED');});
test('hex casing does not invalidate an otherwise matching receipt',async()=>{const {service}=make({direct:()=>({...receipt,blockHash:blockHash.toUpperCase()})});assert.equal((await service.lookup(hash,'ethereum')).onePage.summaryState,'RICH');});
test('fallback provider chain verification is coalesced across enrichment methods',async()=>{const {service,calls}=make({failEnrichment:true});await service.lookup(hash,'ethereum');for(const url of CHAINS.ethereum.rpc)assert.equal(calls.filter(c=>c.url===url&&c.method==='eth_chainId').length,1);});
test('wrong-chain fallback receipts are never queried or trusted',async()=>{const {service,calls}=make({wrongFallback:true,blockReceipts:[]});const r=await service.lookup(hash,'ethereum');assert.equal(r.onePage.summaryState,'LIMITED');assert.equal(calls.filter(c=>c.url!==CHAINS.ethereum.rpc[0]&&c.method==='eth_getBlockReceipts').length,0);});
test('JSON-RPC quota errors start provider cooldown even with HTTP 200',async()=>{let count=0;const t=createTransport({fetcher:async()=>{count++;return Response.json({jsonrpc:'2.0',id:1,error:{code:-32005,message:'limit exceeded'}});}});await assert.rejects(t.rpc('https://rpc.test','eth_getTransactionReceipt',[hash]),e=>e.code==='RATE_LIMITED');await assert.rejects(t.rpc('https://rpc.test','eth_chainId',[]),e=>e.code==='RATE_LIMITED');assert.equal(count,1);});
test('provider-specific JSON-RPC rate-limit messages start cooldown',async()=>{const t=createTransport({fetcher:async()=>Response.json({error:{code:-32000,message:'Too many requests for this API key'}})});await assert.rejects(t.rpc('https://rpc.test','eth_chainId',[]),e=>e.code==='RATE_LIMITED');});
for(const prefix of ['https://tronscan.org/transaction/','https://tronscan.org/#/transaction/'])test('Tron overview URL is normalized: '+prefix,()=>{const p=parseInput(prefix+hash.slice(2)+'/overview');assert.equal(p.network,'tron');assert.equal(p.value,hash.slice(2));});
test('Solana status-only response does not prevent full-data provider fallback',async()=>{
 const calls=[];const primary='https://solana-rpc.publicnode.com';
 const transport={rpc:async(url,method)=>{
  calls.push({url,method});
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getTransaction')return url===primary?null:{slot:42,blockTime:1700000000,meta:{err:null,fee:5000},transaction:{signatures:[signature],message:{accountKeys:[{pubkey:'payer'}],instructions:[]}}};
  if(method==='getSignatureStatuses')return {value:[{slot:42,err:null,confirmationStatus:'finalized'}]};
  throw new ProviderError();
 }};
 const r=await createLookup({transport,env:{}}).lookup(signature,'solana');assert.equal(r.onePage.summaryState,'RICH');assert.ok(calls.some(c=>c.url!==primary&&c.method==='getTransaction'));
});
test('non-JSON-RPC errors do not falsely trigger a quota cooldown',async()=>{let calls=0;const t=createTransport({fetcher:async()=>{calls++;return calls===1?Response.json({error:{code:-32601,message:'Method not found'}}):Response.json({result:'0x1'});}});await assert.rejects(t.rpc('https://rpc.test','unsupported',[]),e=>e.code==='RPC_ERROR');assert.equal(await t.rpc('https://rpc.test','eth_chainId',[]),'0x1');});

test('repeated token transfers share metadata RPC requests',async()=>{
 const abi=new Interface(['function decimals() view returns (uint8)','function symbol() view returns (string)','event Transfer(address indexed from,address indexed to,uint256 value)']);
 const address='0x'+'1'.repeat(40);
 const log={address,...abi.encodeEventLog(abi.getEvent('Transfer'),[address,address,12345678n])};
 const {service,transport}=make({direct:()=>({...receipt,logs:Array(12).fill(log)})});
 const rpc=transport.rpc;let metadataCalls=0;
 transport.rpc=async(url,method,params)=>{if(method!=='eth_call')return rpc(url,method,params);metadataCalls++;return params[0].data===abi.encodeFunctionData('decimals')?abi.encodeFunctionResult('decimals',[6]):abi.encodeFunctionResult('symbol',['TEST']);};
 const r=await service.lookup(hash,'ethereum');
 assert.equal(r.onePage.fields.filter(f=>/^Token transfer /.test(f.key)).length,12);
 assert.equal(metadataCalls,2);
 assert.match(r.onePage.fields.find(f=>f.key==='Token transfer 12').value,/12.345678 TEST/);
});
test('token metadata can fail over independently of transaction lookup',async()=>{
 const abi=new Interface(['function decimals() view returns (uint8)','function symbol() view returns (string)','event Transfer(address indexed from,address indexed to,uint256 value)']);
 const address='0x'+'1'.repeat(40);
 const log={address,...abi.encodeEventLog(abi.getEvent('Transfer'),[address,address,1n])};
 const {service,transport}=make({direct:()=>({...receipt,logs:[log]})});const rpc=transport.rpc;const used=[];
 transport.rpc=async(url,method,params)=>{if(method!=='eth_call')return rpc(url,method,params);used.push(url);if(url===CHAINS.ethereum.rpc[0])throw new ProviderError();return params[0].data===abi.encodeFunctionData('decimals')?abi.encodeFunctionResult('decimals',[6]):abi.encodeFunctionResult('symbol',['TEST']);};
 const r=await service.lookup(hash,'ethereum');assert.match(r.onePage.fields.find(f=>f.key==='Token transfer 1').value,/0.000001 TEST/);assert.ok(used.includes(CHAINS.ethereum.rpc[1]));
});
