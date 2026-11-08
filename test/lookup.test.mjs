import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface } from 'ethers';
import bolt11 from 'bolt11';
import { createLookup } from '../lib/lookup.mjs';
import { CHAINS, parseInput, InputError } from '../lib/input.mjs';
import { ProviderError } from '../lib/providers.mjs';
const hash='0x'+'a'.repeat(64), blockHash='0x'+'b'.repeat(64), addr='0x'+'1'.repeat(40);
const signature='4ReKprwf3WdLHRrzp4ctPWNBsQDPL3VZz3zMmoZfcGJMJCHh5Vq937mPdyxhCbw54wNnA6hZ7KfNpQdpt13yY7A9';
const field=(r,k)=>r.onePage.fields.find(f=>f.key===k)?.value;
function fixture(options={}) {
 const calls=[];
 const chainFor=url=>url.includes('polygon')?'polygon':url.includes('arbitrum')||url.includes('arb1.')?'arbitrum':'ethereum';
 const transport={
 async rpc(url,method,params) {
  const chain=chainFor(url); calls.push({chain,method,url,params});
  if(options.fail?.(chain,method,url))throw new ProviderError();
  if(method==='eth_chainId')return '0x'+(options.wrongChain?99:CHAINS[chain].id).toString(16);
  if(method==='eth_getTransactionByHash')return (options.matches || ['ethereum']).includes(chain)?{hash:options.badHash?'0x'+'f'.repeat(64):hash,chainId:'0x'+CHAINS[chain].id.toString(16),from:addr,to:addr,value:options.value||'0x1',gasPrice:'0x3b9aca00',blockNumber:options.pending?null:'0x10',blockHash:options.pending?null:blockHash}:null;
  if(method==='eth_getTransactionReceipt')return options.noReceipt||options.pending?null:{transactionHash:hash,blockHash,status:options.failed?'0x0':'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x3b9aca00',logs:options.logs||[]};
  if(method==='eth_blockNumber')return '0x12';
  if(method==='eth_getBlockByNumber')return {hash:blockHash,timestamp:'0x6553f100'};
  if(method==='eth_getBalance')return '0x0';
  if(method==='eth_getTransactionCount')return '0x0';
  if(method==='eth_call')return options.call?.(params[0]);
  if(method==='getGenesisHash')return options.solWrong?'wrong':'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getAccountInfo')return {value:{lamports:1,owner:'11111111111111111111111111111111'}};
  if(method==='getTransaction')return options.solTx ?? null;
  if(method==='getSignatureStatuses')return {value:[options.solStatus||null]};
  throw Error('Unhandled mock RPC '+method);
 },
 async json(url) {
   calls.push({url});
   if(url.includes('tronscan'))return options.tron || {};
   if(options.btc)return {...options.btc,txid:hash.slice(2)};
   throw new ProviderError('NOT_FOUND');
 }
 };
 return {service:createLookup({transport,env:options.env || {},now:options.now}),calls};
}
for(const chain of ['ethereum','polygon','arbitrum'])test(`${chain} transaction resolves by hash`,async()=>{
 const {service}=fixture({matches:[chain]});const r=await service.lookup(hash);assert.equal(r.resolvedChain,chain);assert.equal(field(r,'Status'),'Confirmed');assert.equal(field(r,'Confirmations'),'3');assert.equal(field(r,'Native value'),'0.000000000000000001 '+CHAINS[chain].symbol);assert.equal(r.outputs.length,1);
});
test('all EVM chains start concurrently',async()=>{const {service,calls}=fixture();await service.lookup(hash);assert.deepEqual(new Set(calls.slice(0,3).map(c=>c.chain)),new Set(['ethereum','polygon','arbitrum']));});
test('failed EVM execution is never confirmed',async()=>{const {service}=fixture({failed:true});assert.equal(field(await service.lookup(hash),'Status'),'Failed');});
test('pending EVM transaction is preserved',async()=>{const {service}=fixture({pending:true});assert.equal(field(await service.lookup(hash),'Status'),'Pending');});
test('included transaction with missing receipt is partial, not pending',async()=>{const {service}=fixture({noReceipt:true});const r=await service.lookup(hash);assert.equal(r.onePage.summaryState,'LIMITED');assert.match(field(r,'Status'),/receipt unavailable/);});
test('wrong chain endpoint is never trusted',async()=>{const {service}=fixture({wrongChain:true});const r=await service.lookup(hash);assert.equal(r.resolvedChain,null);assert.equal(r.onePage.summaryState,'FETCH_FAILED');});
test('mismatched returned hash is never trusted',async()=>{const {service}=fixture({badHash:true});assert.equal((await service.lookup(hash)).onePage.summaryState,'FETCH_FAILED');});
test('first provider outage fails over',async()=>{const {service,calls}=fixture({fail:(c,m,u)=>u.includes('ethereum-rpc.publicnode')});const r=await service.lookup(hash,'ethereum');assert.equal(r.resolvedChain,'ethereum');assert.ok(calls.some(c=>c.url?.includes('llamarpc')));});
test('no transaction differs from outage',async()=>{const {service}=fixture({matches:[]});const r=await service.lookup(hash);assert.equal(r.onePage.summaryState,'NOT_FOUND');assert.equal(r.resolvedChain,null);});
test('partial scan outage is never called not found',async()=>{const {service}=fixture({matches:[],fail:c=>c==='polygon'});assert.equal((await service.lookup(hash)).onePage.summaryState,'FETCH_FAILED');});
test('multiple chain matches are retained',async()=>{const {service}=fixture({matches:['ethereum','polygon']});const r=await service.lookup(hash);assert.equal(r.outputs.length,2);assert.equal(r.resolvedChain,null);assert.match(r.agentHint,/multiple networks/);});
test('raw hex EVM hash is found without 0x',async()=>{const {service}=fixture();assert.equal((await service.lookup(hash.slice(2))).resolvedChain,'ethereum');});
test('unrecognized raw hex never defaults to Tron',async()=>{const {service}=fixture({matches:[]});const r=await service.lookup(hash.slice(2));assert.equal(r.resolvedChain,null);assert.equal(r.onePage.summaryState,'NOT_FOUND');});
test('explicit chain only queries selected chain',async()=>{const {service,calls}=fixture({matches:['polygon']});await service.lookup(hash,'polygon');assert.deepEqual(new Set(calls.map(c=>c.chain)),new Set(['polygon']));});
test('known explorer URL selects the exact network',async()=>{const {service}=fixture({matches:['arbitrum']});assert.equal((await service.lookup('https://arbiscan.io/tx/'+hash)).resolvedChain,'arbitrum');});
test('EVM address returns balances on all networks',async()=>{const {service}=fixture();const r=await service.lookup(addr);assert.equal(r.outputs.length,3);assert.equal(field(r,'Balance'),'0.0 ETH');});
test('ERC20 exact units and contract are shown',async()=>{
 const abi=new Interface(['function decimals() view returns (uint8)','function symbol() view returns (string)','event Transfer(address indexed from,address indexed to,uint256 value)']);
 const encoded=abi.encodeEventLog(abi.getEvent('Transfer'),[addr,addr,123456789012345678901n]);
 const {service}=fixture({logs:[{address:addr,...encoded}],call:t=>t.data===abi.encodeFunctionData('decimals')?abi.encodeFunctionResult('decimals',[6]):abi.encodeFunctionResult('symbol',['USDT'])});
 const r=await service.lookup(hash,'ethereum');assert.match(field(r,'Token transfer 1'),/^123456789012345.678901 USDT/);assert.equal(field(r,'Token 1 contract'),addr);
});
test('missing ERC20 metadata retains raw base units',async()=>{const abi=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);const {service}=fixture({logs:[{address:addr,...abi.encodeEventLog(abi.getEvent('Transfer'),[addr,addr,1n])}]});assert.match(field(await service.lookup(hash,'ethereum'),'Token transfer 1'),/1 base units/);});
test('Bitcoin summary totals include change warning',async()=>{const {service}=fixture({matches:[],btc:{status:{confirmed:true,block_height:100,block_time:1700000000},fee:123,vin:[{}],vout:[{value:123456789,scriptpubkey_address:'bc1test'}]}});const r=await service.lookup(hash.slice(2));assert.equal(r.resolvedChain,'bitcoin');assert.equal(field(r,'Outputs total'),'1.23456789 BTC');assert.match(field(r,'Note'),/change/);});
test('Tron failed execution does not become confirmed',async()=>{const {service}=fixture({tron:{hash:hash.slice(2),confirmed:true,contractType:31,contractRet:['REVERT']}});assert.equal(field(await service.lookup(hash.slice(2),'tron'),'Status'),'Failed');});
test('Tron zero-decimal token stays exact',async()=>{const {service}=fixture({tron:{hash:hash.slice(2),confirmed:true,contractType:31,contractRet:'SUCCESS',trc20TransferInfo:[{amount_str:'900719925474099312345',decimals:0,symbol:'TEST',contract_address:'Ttest'}]}});assert.match(field(await service.lookup(hash.slice(2),'tron'),'Token transfer 1'),/^900719925474099312345 TEST/);});
test('Solana address is distinguished from signature',async()=>{const {service}=fixture();const r=await service.lookup('11111111111111111111111111111111');assert.equal(r.onePage.entityType,'address');assert.equal(field(r,'Balance'),'0.000000001 SOL');});
test('Solana signature status survives unavailable details',async()=>{const {service}=fixture({solStatus:{slot:42,confirmationStatus:'finalized',err:null}});assert.equal((await service.lookup(signature)).onePage.summaryState,'LIMITED');});
test('Solana parsed failed transaction',async()=>{const {service}=fixture({solTx:{slot:42,meta:{fee:5000,err:{InstructionError:[0,'Custom']}},transaction:{signatures:[signature],message:{accountKeys:[{pubkey:'payer'}],instructions:[]}}}});assert.equal(field(await service.lookup(signature),'Status'),'Failed');});
test('Solana wrong genesis is unavailable',async()=>{const {service}=fixture({solWrong:true});assert.equal((await service.lookup(signature)).onePage.summaryState,'FETCH_FAILED');});
test('Helius key stays server side',async()=>{const {service,calls}=fixture({env:{HELIUS_API_KEY:'secret-value'},solStatus:{slot:1,err:null}});const r=await service.lookup(signature);assert.ok(calls.some(c=>c.url.includes('secret-value')));assert.ok(!JSON.stringify(r).includes('secret-value'));});
test('concurrent identical requests coalesce and cache',async()=>{const {service,calls}=fixture();const a=await Promise.all([service.lookup(hash),service.lookup(hash)]);const count=calls.length;await service.lookup(hash);assert.equal(calls.length,count);a[0].onePage.fields.length=0;assert.ok((await service.lookup(hash)).onePage.fields.length);});
test('cache expires',async()=>{let time=0;const {service,calls}=fixture({now:()=>time});await service.lookup(hash);const count=calls.length;time=16000;await service.lookup(hash);assert.ok(calls.length>count);});
test('invalid lightning invoice rejected',async()=>{const {service}=fixture();await assert.rejects(service.lookup('lnbc1invalid'),InputError);});
test('valid invoice decoded with settlement explicitly unknown',async()=>{
 const encoded=bolt11.encode({satoshis:123,timestamp:1700000000,tags:[{tagName:'payment_hash',data:'ab'.repeat(32)},{tagName:'description',data:'test payment'}]});
 const signed=bolt11.sign(encoded,'01'.repeat(32));
 const {service,calls}=fixture();const r=await service.lookup(signed.paymentRequest);assert.equal(r.onePage.entityType,'invoice');assert.match(field(r,'Status'),/payment status unknown/);assert.equal(field(r,'Amount'),'123000 millisatoshis');assert.equal(calls.length,0);assert.equal(r.outputs.length,0);
});
for(const [input,network] of [['hello','auto'],['https://etherscan.io.evil.com/tx/'+hash,'auto'],['https://sepolia.etherscan.io/tx/'+hash,'auto'],['https://etherscan.io/tx/'+hash,'solana'],[hash,'bitcoin'],['https://solscan.io/tx/'+signature+'?cluster=devnet','auto'],['a'.repeat(12001),'auto'],[{},'auto'],[hash,'unknown'],['https://mempool.space/testnet/tx/'+hash.slice(2),'auto']])test('reject invalid input '+String(input).slice(0,65)+' '+network,()=>assert.throws(()=>parseInput(input,network),InputError));
test('Bitcoin address requires a valid checksum',()=>{assert.equal(parseInput('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa').network,'bitcoin');assert.throws(()=>parseInput('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb'),InputError);});
test('Tron address requires a valid checksum',()=>{assert.equal(parseInput('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t').network,'tron');assert.throws(()=>parseInput('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u'),InputError);});
test('Solana mainnet verification uses the complete genesis hash',async()=>{const {service,calls}=fixture({solStatus:{slot:1,err:null}});const r=await service.lookup(signature);assert.equal(r.onePage.summaryState,'LIMITED');assert.ok(calls.some(c=>c.method==='getGenesisHash'));});
test('unsafe JSON numeric balances are rejected instead of rounded',async()=>{const transport={rpc:async(url,method)=>{if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';if(method==='getAccountInfo')return {value:{lamports:Number.MAX_SAFE_INTEGER+1}};throw new ProviderError();}};const service=createLookup({transport,env:{}});assert.equal((await service.lookup('11111111111111111111111111111111')).onePage.summaryState,'FETCH_FAILED');});
test('a lookup deadline stops all provider probes',async()=>{const start=performance.now();const transport={rpc:async(url,method,params,signal)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new ProviderError()),300);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new ProviderError('TIMEOUT'));},{once:true});})};const service=createLookup({transport,env:{},budgetMs:25});assert.equal((await service.lookup(hash)).onePage.summaryState,'FETCH_FAILED');assert.ok(performance.now()-start<250);});
