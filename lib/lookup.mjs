import { formatUnits, Interface } from 'ethers';
import bolt11 from 'bolt11';
import { CHAINS, InputError, parseInput, f, page, result } from './input.mjs';
import { createTransport, ProviderError, endpoints } from './providers.mjs';
const EVM = ['ethereum','polygon','arbitrum'];
const tokenAbi = new Interface(['function decimals() view returns (uint8)','function symbol() view returns (string)','event Transfer(address indexed from,address indexed to,uint256 value)']);
const transferTopic = tokenAbi.getEvent('Transfer').topicHash;
const isHex = s => typeof s === 'string' && /^0x[0-9a-f]+$/i.test(s);
const qty = s => isHex(s) ? BigInt(s) : null;
const date = s => Number.isFinite(Number(s)) ? new Date(Number(s)*1000).toISOString() : '';
const exact = v => { if(typeof v==='number' && !Number.isSafeInteger(v))throw new ProviderError('UNSAFE_INTEGER'); return BigInt(v); };
const units = (v,d,s) => `${formatUnits(exact(v),d)}${s ? ' '+s : ''}`;
function unavailable(chain,id,reason='Provider temporarily unavailable. Retry shortly.',kind='tx') {
  const p = page(chain,id,[f('Status','Unable to verify','status'),f('Note',reason)],'FETCH_FAILED',kind);
  p.fetchError = reason; return p;
}
function missing(chain,id,kind='tx') { return page(chain,id,[f('Status','Not found','status'),f('Note','No record was returned by the available mainnet providers. Check the network and retry if this transaction was just submitted.')],'NOT_FOUND',kind); }
export function createLookup({env = process.env, transport = createTransport(), budgetMs = 20000, now = Date.now} = {}) {
  const inflight = new Map(), cache = new Map();
  async function evm(chain,hash,signal,kind='tx') {
    const c = CHAINS[chain];
    let urls; try { urls = endpoints(chain,env) || c.rpc; } catch { return unavailable(chain,hash,'The network provider configuration needs attention.',kind); }
    let anyNull = false, anyError = false;
    let tx = null, chosen;
    for (const url of urls) {
      if (signal.aborted) break;
      try {
        const id = await transport.rpc(url,'eth_chainId',[],signal);
        if (qty(id) !== BigInt(c.id)) throw new ProviderError('WRONG_CHAIN');
        if (kind === 'address') {
          const [balance,nonce] = await Promise.all([transport.rpc(url,'eth_getBalance',[hash,'latest'],signal),transport.rpc(url,'eth_getTransactionCount',[hash,'latest'],signal)]);
          if (qty(balance) === null || qty(nonce) === null) throw new ProviderError('MALFORMED');
          return page(chain,hash,[f('Address',hash,'address'),f('Balance',units(balance,18,c.symbol),'amount'),f('Outgoing transaction count',qty(nonce)),f('Note','Balance and outgoing nonce only; this is not a complete token balance or transaction history.')],'RICH','address');
        }
        const value = await transport.rpc(url,'eth_getTransactionByHash',[hash],signal);
        if (value === null) { anyNull = true; continue; }
        if (!value || value.hash?.toLowerCase() !== hash.toLowerCase() || qty(value.value) === null || (value.chainId != null && qty(value.chainId) !== BigInt(c.id))) throw new ProviderError('MALFORMED');
        tx = value; chosen = url; break;
      } catch { anyError = true; }
    }
    if (!tx) return anyNull && !anyError ? missing(chain,hash,kind) : unavailable(chain,hash,undefined,kind);
    // Failures during enrichment must not erase a verified transaction.
    const enrich = async (method,params,validate) => {
      for (const url of [chosen,...urls.filter(u=>u!==chosen)]) {
        if (signal.aborted) break;
        try {
          if (url!==chosen && qty(await transport.rpc(url,'eth_chainId',[],signal)) !== BigInt(c.id)) continue;
          const v = await transport.rpc(url,method,params,signal);
          if (validate(v)) return v;
        } catch {}
      }
      return null;
    };
    const [receipt,head,block] = await Promise.all([
      enrich('eth_getTransactionReceipt',[hash],v=> v && v.transactionHash?.toLowerCase()===hash.toLowerCase() && (tx.blockHash == null || v.blockHash === tx.blockHash)),
      enrich('eth_blockNumber',[],v=>qty(v)!==null),
      tx.blockNumber == null ? null : enrich('eth_getBlockByNumber',[tx.blockNumber,false],v=>v && qty(v.timestamp)!==null && (tx.blockHash == null || v.hash===tx.blockHash))
    ]);
    const status = receipt ? qty(receipt.status)===1n ? 'Confirmed' : qty(receipt.status)===0n ? 'Failed':'Included (execution status unavailable)' : tx.blockNumber == null ? 'Pending' : 'Included (receipt unavailable)';
    const fields = [f('Status',status,'status'),f('Transaction hash',hash,'hash'),f('From',tx.from,'address'),f('To',tx.to || receipt?.contractAddress || 'Contract creation','address'),f('Native value',units(tx.value,18,c.symbol),'amount')];
    if (qty(tx.blockNumber)!==null) fields.push(f('Block',qty(tx.blockNumber)));
    if (head && tx.blockNumber && qty(head)>=qty(tx.blockNumber)) fields.push(f('Confirmations',qty(head)-qty(tx.blockNumber)+1n));
    if (block) fields.push(f('Timestamp',date(Number(qty(block.timestamp))),'timestamp'));
    if (qty(receipt?.gasUsed)!==null && qty(receipt?.effectiveGasPrice ?? tx.gasPrice)!==null) fields.push(f('Execution fee',units(qty(receipt.gasUsed)*qty(receipt.effectiveGasPrice ?? tx.gasPrice),18,c.symbol),'amount'));
    if (receipt?.l1Fee && qty(receipt.l1Fee)!==null) fields.push(f('L1 data fee',units(receipt.l1Fee,18,c.symbol),'amount'));
    if (receipt?.gasUsed) fields.push(f('Gas used',qty(receipt.gasUsed)));
    if (tx.gasPrice) fields.push(f('Gas price',units(tx.gasPrice,9,'Gwei'),'amount'));
    if (chain === 'arbitrum') fields.push(f('Fee note','Execution fee is reported by the chain receipt; additional fee components may apply.'));
    // Standard ERC-20 transfer logs only. Never infer payment amount from calldata or trust token names.
    const logs = (Array.isArray(receipt?.logs) ? receipt.logs : []).filter(l=> l?.topics?.[0]===transferTopic && l.topics.length===3 && /^0x[\da-f]{64}$/i.test(l.data||'')).slice(0,12);
    await Promise.all(logs.map(async (log,i)=>{
      try {
        const transfer = tokenAbi.parseLog(log);
        const raw = transfer.args.value;
        let decimals = null, symbol = '';
        try {
          const [d,s] = await Promise.all([
            transport.rpc(chosen,'eth_call',[{to:log.address,data:tokenAbi.encodeFunctionData('decimals')},'latest'],signal),
            transport.rpc(chosen,'eth_call',[{to:log.address,data:tokenAbi.encodeFunctionData('symbol')},'latest'],signal)
          ]);
          decimals = Number(tokenAbi.decodeFunctionResult('decimals',d)[0]);
          symbol = String(tokenAbi.decodeFunctionResult('symbol',s)[0]).slice(0,32);
        } catch {}
        const tokenFields = [f(`Token transfer ${i+1}`,decimals!==null && decimals<=80 ? `${units(raw,decimals,symbol)} (token-reported metadata)` : `${raw} base units (decimals unavailable)`,'amount'),f(`Token ${i+1} contract`,log.address,'address'),f(`Token ${i+1} from`,transfer.args.from,'address'),f(`Token ${i+1} to`,transfer.args.to,'address')];
        return {i,fields:tokenFields};
      } catch { return null; }
    })).then(items=>items.filter(Boolean).sort((a,b)=>a.i-b.i).forEach(x=>fields.push(...x.fields)));
    if (logs.length) fields.push(f('Token note','Token contract addresses identify assets. Token names are not proof of authenticity. Showing up to 12 standard ERC-20 transfers; internal transfers and other events are not indexed.'));
    const p = page(chain,hash,fields,tx.blockNumber!=null && !receipt ? 'LIMITED':'RICH');
    if (signal.aborted || (tx.blockNumber!=null && !block)) p.agentNote = 'The transaction was found. Some additional details could not be loaded.';
    return p;
  }
  async function bitcoin(hash,signal) {
    let failures = false;
    for (const base of ['https://mempool.space/api','https://blockstream.info/api']) {
      try {
        const tx = await transport.json(`${base}/tx/${hash}`,{},signal);
        if (tx.txid?.toLowerCase()!==hash || !Array.isArray(tx.vin) || !Array.isArray(tx.vout) || typeof tx.status?.confirmed!=='boolean') throw new ProviderError('MALFORMED');
        const sum = tx.vout.reduce((total,x)=>total+exact(x.value),0n);
        const fields = [f('Status',tx.status.confirmed?'Confirmed':'Unconfirmed','status'),f('Transaction ID',hash,'hash'),f('Fee',units(tx.fee,8,'BTC'),'amount'),f('Outputs total',units(sum,8,'BTC'),'amount'),f('Inputs',tx.vin.length),f('Outputs',tx.vout.length),f('Note','Outputs include change. The output total is not necessarily the customer payment amount.')];
        if (tx.status.block_height) fields.push(f('Block',tx.status.block_height),f('Timestamp',date(tx.status.block_time),'timestamp'));
        tx.vout.slice(0,12).forEach((o,i)=>fields.push(f(`Output ${i+1}`,`${units(o.value,8,'BTC')} → ${o.scriptpubkey_address || 'Script output'}`)));
        return page('bitcoin',hash,fields);
      } catch(e) { if (e.code!=='NOT_FOUND') failures=true; }
    }
    return failures ? unavailable('bitcoin',hash) : missing('bitcoin',hash);
  }
  async function tron(hash,signal) {
    try {
      const tx = await transport.json(`https://apilist.tronscanapi.com/api/transaction-info?hash=${hash}`,{},signal);
      if (Object.keys(tx).length===0) return missing('tron',hash);
      if (tx.hash?.toLowerCase()!==hash || !Array.isArray(tx.contractRet) && typeof tx.contractRet!=='string' && tx.contractType==null) throw new ProviderError('MALFORMED');
      const ret = Array.isArray(tx.contractRet) ? tx.contractRet[0] : tx.contractRet;
      const execution = typeof ret === 'object' ? ret?.contractRet : ret;
      const failed = execution && execution!=='SUCCESS';
      const status = failed ? 'Failed' : tx.confirmed===true ? (execution==='SUCCESS'?'Confirmed':'Included (execution status unavailable)') : 'Pending';
      const fields = [f('Status',status,'status'),f('Transaction hash',hash,'hash'),f('Block',tx.block),f('Timestamp',tx.timestamp ? new Date(tx.timestamp).toISOString() : '','timestamp'),f('From',tx.ownerAddress || tx.contractData?.owner_address,'address'),f('To',tx.toAddress || tx.contractData?.to_address,'address')];
      if (tx.contractData?.amount!=null) fields.push(f('Native value',units(tx.contractData.amount,6,'TRX'),'amount'));
      if (tx.cost?.fee!=null) fields.push(f('Fee',units(tx.cost.fee,6,'TRX'),'amount'));
      (tx.trc20TransferInfo || []).slice(0,12).forEach((t,i)=>{
        const dec = Number(t.decimals ?? t.tokenDecimal);
        const raw = t.amount_str ?? t.amount;
        if (raw==null || !/^\d+$/.test(String(raw))) return;
        fields.push(f(`Token transfer ${i+1}`,Number.isInteger(dec) && dec>=0 && dec<=80 ? `${units(raw,dec,String(t.symbol || t.tokenAbbr || '').slice(0,32))} (token-reported metadata)` : `${raw} base units`,'amount'),f(`Token ${i+1} contract`,t.contract_address || t.contractAddress,'address'),f(`Token ${i+1} from`,t.from_address || t.from,'address'),f(`Token ${i+1} to`,t.to_address || t.to,'address'));
      });
      return page('tron',hash,fields);
    } catch(e) { return e.code==='NOT_FOUND' ? missing('tron',hash) : unavailable('tron',hash); }
  }
  async function solana(signature,signal,kind) {
    let urls;
    try { urls = endpoints('solana',env) || [ ...(env.HELIUS_API_KEY ? [`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(env.HELIUS_API_KEY)}`] : []), 'https://solana-rpc.publicnode.com','https://api.mainnet-beta.solana.com' ]; }
    catch { return unavailable('solana',signature,'The network provider configuration needs attention.',kind); }
    let errors = false;
    for (const url of urls) {
      if (signal.aborted) break;
      try {
        // Verify mainnet even for custom providers.
        if (await transport.rpc(url,'getGenesisHash',[],signal)!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') throw new ProviderError('WRONG_CHAIN');
        if (kind==='address') {
          const info = await transport.rpc(url,'getAccountInfo',[signature,{encoding:'jsonParsed',commitment:'confirmed'}],signal);
          if (!Object.hasOwn(info||{},'value')) throw new ProviderError('MALFORMED');
          if (info.value===null) return missing('solana',signature,kind);
          return page('solana',signature,[f('Address',signature,'address'),f('Balance',units(info.value.lamports,9,'SOL'),'amount'),f('Owner program',info.value.owner,'address'),f('Note','Account balance only; transaction history and token balances are not indexed.')],'RICH',kind);
        }
        const tx = await transport.rpc(url,'getTransaction',[signature,{encoding:'jsonParsed',commitment:'confirmed',maxSupportedTransactionVersion:0}],signal);
        if (!tx) {
          const statuses = await transport.rpc(url,'getSignatureStatuses',[[signature],{searchTransactionHistory:true}],signal);
          if (!Array.isArray(statuses?.value)) throw new ProviderError('MALFORMED');
          const s = statuses.value[0];
          if (s) return page('solana',signature,[f('Status',s.err?'Failed':s.confirmationStatus || 'Processed','status'),f('Slot',s.slot),f('Signature',signature,'hash'),f('Note','Signature found; full details are not currently available.')],'LIMITED');
          continue;
        }
        if (tx.transaction?.signatures?.[0]!==signature || !tx.meta || !Number.isInteger(tx.slot)) throw new ProviderError('MALFORMED');
        const fields = [f('Status',tx.meta.err?'Failed':'Confirmed','status'),f('Signature',signature,'hash'),f('Slot',tx.slot),f('Timestamp',tx.blockTime ? date(tx.blockTime) : '','timestamp'),f('Fee',units(tx.meta.fee,9,'SOL'),'amount'),f('Fee payer',tx.transaction.message?.accountKeys?.[0]?.pubkey,'address')];
        // Parsed top-level and inner native/SPL transfers, preserving exact string token quantities.
        const instructions = [...(tx.transaction.message?.instructions || []),...(tx.meta.innerInstructions || []).flatMap(x=>x.instructions || [])];
        instructions.filter(i=>['transfer','transferChecked'].includes(i.parsed?.type)).slice(0,12).forEach((i,n)=>{
          const t = i.parsed.info;
          fields.push(f(`Transfer ${n+1} from`,t.source,'address'),f(`Transfer ${n+1} to`,t.destination,'address'));
          if (i.program==='system' && t.lamports!=null) fields.push(f(`Transfer ${n+1} amount`,units(t.lamports,9,'SOL'),'amount'));
          else if (t.tokenAmount?.amount!=null) fields.push(f(`Transfer ${n+1} amount`,units(t.tokenAmount.amount,t.tokenAmount.decimals,'token units'),'amount'));
          else if (t.amount!=null) fields.push(f(`Transfer ${n+1} base units`,t.amount,'amount'));
          if (t.mint) fields.push(f(`Transfer ${n+1} mint`,t.mint,'address'));
        });
        if (tx.meta.err) fields.push(f('Execution error',JSON.stringify(tx.meta.err)));
        fields.push(f('Note','Transfers describe execution records, not a verified merchant payment. Failed transaction transfers did not settle. Token addresses may be token accounts.'));
        return page('solana',signature,fields);
      } catch { errors = true; }
    }
    return errors ? unavailable('solana',signature,undefined,kind) : missing('solana',signature,kind);
  }
  function lightning(invoice) {
    let d; try { d = bolt11.decode(invoice); } catch { throw new InputError('Invalid BOLT11 invoice or checksum.'); }
    const tags = Object.fromEntries(d.tags.map(t=>[t.tagName,t.data]));
    const expiry = d.timeExpireDate ?? d.timestamp + Number(tags.expire_time ?? 3600);
    const p = page('lightning',invoice,[f('Status',expiry*1000<now()?'Expired invoice; payment status unknown':'Invoice decoded; payment status unknown','status'),f('Network',d.network?.bech32==='bc'?'Bitcoin mainnet':'Bitcoin test network'),f('Amount',d.millisatoshis!=null ? `${d.millisatoshis} millisatoshis`:'Amount specified by payer','amount'),f('Created',date(d.timestamp),'timestamp'),f('Expires',date(expiry),'timestamp'),f('Payment hash',tags.payment_hash,'hash'),f('Description',tags.description),f('Note','An invoice cannot prove that a Lightning payment settled. Check payment status in your Triple-A payment record.')],'LIMITED','invoice');
    p.explorerBest = null; p.resolvedChain = null; return p;
  }
  async function run(parsed) {
    const {value,network,kind} = parsed;
    if (network==='lightning') return result([lightning(value)],value);
    if (kind==='address' && ['bitcoin','tron'].includes(network)) return result([page(network,value,[f('Address',value,'address'),f('Note','Address history is not indexed. Paste a transaction hash to inspect a payment.')],'LIMITED',kind)],value);
    const signal = AbortSignal.timeout(budgetMs);
    const networks = network==='hex64' ? [...EVM,'bitcoin','tron'] : network==='evm' ? EVM : [network];
    const pages = await Promise.all(networks.map(chain=> {
      if (EVM.includes(chain)) return evm(chain,value.startsWith('0x')?value:'0x'+value,signal,kind).catch(()=>unavailable(chain,value,undefined,kind));
      if (chain==='bitcoin') return bitcoin(value,signal);
      if (chain==='tron') return tron(value.replace(/^0x/,''),signal);
      return solana(value,signal,kind).catch(()=>unavailable(chain,value,undefined,kind));
    }));
    const found = pages.filter(p=>['RICH','LIMITED'].includes(p.summaryState));
    if (found.length) {
      const unavailableNetworks = pages.filter(p=>p.summaryState==='FETCH_FAILED').map(p=>p.network);
      let note = found.length>1 && kind==='tx' ? 'This hash was found on multiple networks. Review each network summary.' : '';
      if (unavailableNetworks.length) note += `${note?' ':''}Could not check ${unavailableNetworks.join(', ')}. A match does not rule out activity on those networks.`;
      return result(found,value,note);
    }
    const failed = pages.some(p=>p.summaryState==='FETCH_FAILED');
    const p = page(networks.length===1?networks[0]:null,value,[f('Status',failed?'Unable to verify':'Not found','status'),...pages.map(p=>f(p.network,p.summaryState==='FETCH_FAILED'?'Provider unavailable':'No record returned')),f('Note',failed?'Some network providers could not be reached. This does not mean the transaction is missing. Retry shortly.':'No transaction was found on the checked mainnets. Verify the full hash and supported network.')],failed?'FETCH_FAILED':'NOT_FOUND',kind);
    p.resolvedChain=null;
    if (failed) p.fetchError='Some providers are unavailable. Retry shortly or select the known network.';
    return result([p],value);
  }
  async function lookup(raw,network='auto') {
    const parsed = parseInput(raw,network);
    const key = JSON.stringify(parsed);
    const old = cache.get(key);
    if (old && old.expires>now()) return structuredClone(old.value);
    if (inflight.has(key)) return structuredClone(await inflight.get(key));
    if (inflight.size>=24) throw new ProviderError('BUSY');
    const task = run(parsed);
    inflight.set(key,task);
    try {
      const value = await task;
      if (parsed.network!=='lightning') {
        if (cache.size>=300) cache.delete(cache.keys().next().value);
        const ttl = value.onePage.summaryState==='FETCH_FAILED' ? 2000 : value.onePage.fields.some(f=>['Pending','Unconfirmed'].includes(f.value)) ? 4000 : 15000;
        cache.set(key,{value:structuredClone(value),expires:now()+ttl});
      }
      return value;
    } finally { inflight.delete(key); }
  }
  return { lookup };
}
