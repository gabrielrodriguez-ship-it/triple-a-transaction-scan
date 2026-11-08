// Opt-in integration checks. These contact public mainnet providers and fail closed.
import { createLookup } from '../lib/lookup.mjs';
import { createTransport } from '../lib/providers.mjs';
import { CHAINS } from '../lib/input.mjs';
const transport=createTransport({timeoutMs:5000});
const service=createLookup();
const reports=[];
async function check(network,discover){
 try{
  const hash=await discover();
  if(!hash)throw Error('No test transaction returned.');
  const r=await service.lookup(hash,network);
  if(r.onePage.summaryState!=='RICH' || r.resolvedChain!==network || !r.onePage.fields.some(f=>/hash|signature|transaction id/i.test(f.key)&&f.value.toLowerCase()===hash.toLowerCase()))throw Error('Transaction summary was incomplete or did not match the requested chain and transaction.');
  reports.push({network,passed:true,hash,status:r.onePage.fields.find(f=>f.key==='Status')?.value});
 }catch{reports.push({network,passed:false,reason:'Provider discovery or lookup failed. Check provider reachability, quotas, credentials, and the deployed configuration.'});}
}
for(const network of ['ethereum','polygon','arbitrum'])await check(network,async()=>{
 const urls=process.env[network.toUpperCase()+'_RPC_URLS']?.split(',').map(x=>x.trim()) || CHAINS[network].rpc;
 for(const url of urls)try{const block=await transport.rpc(url,'eth_getBlockByNumber',['latest',false]);if(block?.transactions?.length)return block.transactions[0];}catch{}
 throw Error();
});
await check('bitcoin',async()=>{const blocks=await transport.json('https://mempool.space/api/blocks');return (await transport.json(`https://mempool.space/api/block/${blocks[0].id}/txids`))[0];});
await check('tron',async()=>{const d=await transport.json('https://apilist.tronscanapi.com/api/transaction?sort=-timestamp&limit=1');return d.data?.[0]?.hash;});
await check('solana',async()=>{
 const url=process.env.SOLANA_RPC_URLS?.split(',')[0] || (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY)}`:'https://solana-rpc.publicnode.com');
 const entries=await transport.rpc(url,'getSignaturesForAddress',['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',{limit:1,commitment:'finalized'}]);return entries?.[0]?.signature;
});
console.log(JSON.stringify({checkedAt:new Date().toISOString(),heliusConfigured:Boolean(process.env.HELIUS_API_KEY),reports},null,2));
if(reports.some(r=>!r.passed))process.exitCode=1;
