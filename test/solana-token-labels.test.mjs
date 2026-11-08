import test from 'node:test';
import assert from 'node:assert/strict';
import {createLookup} from '../lib/lookup.mjs';
const signature='4ReKprwf3WdLHRrzp4ctPWNBsQDPL3VZz3zMmoZfcGJMJCHh5Vq937mPdyxhCbw54wNnA6hZ7KfNpQdpt13yY7A9';
for(const [name,mint,decimals,expected] of [
 ['USDC','EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',6,'30.047 USDC'],
 ['USDT','Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',6,'30.047 USDT'],
 ['unknown mint','different-mint',6,'30.047 token units (symbol unavailable)'],
 ['mismatched decimals','EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',3,'30047.0 token units (symbol unavailable)']
])test('Solana token label: '+name,async()=>{
 const transport={rpc:async(url,method)=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getTransaction')return {slot:42,meta:{err:null,fee:5000},transaction:{signatures:[signature],message:{accountKeys:[{pubkey:'payer'}],instructions:[{program:'spl-token',parsed:{type:'transferChecked',info:{mint,source:'source',destination:'destination',tokenAmount:{amount:'30047000',decimals}}}}]}}};
  throw Error('Unexpected RPC');
 }};
 const r=await createLookup({transport,env:{}}).lookup(signature,'solana');
 assert.equal(r.onePage.fields.find(f=>f.key==='Transfer 1 amount').value,expected);
 assert.equal(r.onePage.fields.find(f=>f.key==='Transfer 1 mint').value,mint);
});
