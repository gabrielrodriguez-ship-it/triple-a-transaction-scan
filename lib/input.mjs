import bitcoinjs from 'bitcoinjs-lib';
import { getAddress } from 'ethers';
import { InputError } from './errors.mjs';
export { InputError } from './errors.mjs';
export const CHAINS = {
  ethereum: { name: 'Ethereum', id: 1, symbol: 'ETH', explorer: 'https://etherscan.io', rpc: ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com'] },
  polygon: { name: 'Polygon', id: 137, symbol: 'POL', explorer: 'https://polygonscan.com', rpc: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org'] },
  arbitrum: { name: 'Arbitrum', id: 42161, symbol: 'ETH', explorer: 'https://arbiscan.io', rpc: ['https://arbitrum-one-rpc.publicnode.com', 'https://arb1.arbitrum.io/rpc'] },
  bitcoin: { name: 'Bitcoin', explorer: 'https://mempool.space' },
  tron: { name: 'Tron', explorer: 'https://tronscan.org/#' },
  solana: { name: 'Solana', explorer: 'https://solscan.io' },
  lightning: { name: 'Lightning' }
};
export function base58Bytes(s) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const c of s) { const i = alphabet.indexOf(c); if (i < 0) return -1; n = n * 58n + BigInt(i); }
  return (s.match(/^1*/)?.[0].length || 0) + (n === 0n ? 0 : Math.ceil(n.toString(16).length / 2));
}
function isBitcoinAddress(value){ try { bitcoinjs.address.toOutputScript(value,bitcoinjs.networks.bitcoin); return true; } catch { return false; } }
function isTronAddress(value){try {return bitcoinjs.address.fromBase58Check(value).version===65;}catch{return false;}}
export function parseInput(raw, forced = 'auto') {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 12000) throw new InputError('Enter a transaction hash, supported explorer URL, address, or BOLT11 invoice (maximum 12,000 characters).');
  if (!['auto','evm',...Object.keys(CHAINS)].includes(forced)) throw new InputError('Unsupported network.');
  let value = raw.trim(), hint = null;
  if (/^https?:/i.test(value)) {
    let u; try { u = new URL(value); } catch { throw new InputError('Invalid explorer URL.'); }
    const hosts = { 'etherscan.io':'ethereum', 'polygonscan.com':'polygon', 'arbiscan.io':'arbitrum', 'mempool.space':'bitcoin', 'blockstream.info':'bitcoin', 'tronscan.org':'tron', 'solscan.io':'solana', 'explorer.solana.com':'solana' };
    hint = hosts[u.hostname.replace(/^www\./,'')];
    if (!hint || u.protocol !== 'https:' || u.username || u.password || u.port) throw new InputError('Use an HTTPS mainnet URL from a supported explorer.');
    if (u.searchParams.has('cluster') && u.searchParams.get('cluster') !== 'mainnet-beta') throw new InputError('Only mainnet is supported.');
    const path = hint === 'tron' ? u.hash.slice(1) || u.pathname : u.pathname;
    const match = path.match(/^\/?(tx|transaction|address|account)\/([^/?#]+)\/?$/);
    if (!match) throw new InputError('Paste the full transaction or address URL. Only mainnet is supported.');
    value = match[2];
  }
  value = value.replace(/^lightning:/i,'');
  if (/\s/.test(value)) throw new InputError('The hash or invoice contains spaces.');
  let family, kind = 'tx';
  if (/^ln(bc|tb|bcrt)[0-9a-z]+$/i.test(value)) { family = 'lightning'; kind = 'invoice'; }
  else if (/^0x[\da-f]{64}$/i.test(value)) { family = 'evm'; value = '0x' + value.slice(2).toLowerCase(); }
  else if (/^0x[\da-f]{40}$/i.test(value)) { family = 'evm'; kind = 'address'; try { value = getAddress(value); } catch { throw new InputError('Invalid EVM address checksum.'); } }
  else if (/^[\da-f]{64}$/i.test(value)) { family = 'hex64'; value = value.toLowerCase(); }
  else if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value) && isTronAddress(value)) { family = 'tron'; kind = 'address'; }
  else if (/^(bc1[ac-hj-np-z02-9]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/.test(value) && isBitcoinAddress(value)) { family = 'bitcoin'; kind = 'address'; }
  else if (/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(value) && [32,64].includes(base58Bytes(value))) { family = 'solana'; kind = base58Bytes(value) === 32 ? 'address' : 'tx'; }
  else throw new InputError('Unrecognized format. Check the complete hash, address, or BOLT11 invoice.');
  const network = forced === 'auto' ? hint || family : forced;
  const isEvm = n => n === 'evm' || Boolean(CHAINS[n]?.id);
  const compatible = network === family || (isEvm(network) && family === 'evm') || (family === 'hex64' && (['hex64','bitcoin','tron'].includes(network) || isEvm(network))) || (family === 'evm' && kind === 'tx' && network === 'tron');
  if (!compatible) throw new InputError('The input format does not match the selected network.');
  if (kind === 'tx' && isEvm(network) && !value.startsWith('0x')) value = '0x' + value;
  if (network === 'tron' && kind === 'tx') value = value.replace(/^0x/,'');
  return { value, network, family, kind };
}
export const f = (key, value, valueType = 'text') => ({ key, value: String(value ?? ''), valueType });
export function page(chain, rawId, fields = [], state = 'RICH', kind = 'tx') {
  const c = CHAINS[chain];
  const path = kind === 'address' ? (chain === 'solana' ? 'account' : 'address') : chain === 'tron' ? 'transaction' : 'tx';
  return { summaryState: state, network: c?.name || 'Supported mainnets', chainId: chain || '', resolvedChain: state === 'RICH' || state === 'LIMITED' ? chain : null, entityType: kind, rawId, fields: fields.filter(x=> x.value !== ''), explorerBest: c?.explorer ? `${c.explorer}/${path}/${encodeURIComponent(rawId)}` : null, fetchedAt: new Date().toISOString() };
}
export function result(pages, input, note = '') {
  const onePage = pages[0];
  const outputs = pages.filter(p=>p.explorerBest).map((p,i)=>({ typeId:`${p.chainId}_${p.entityType}`, rawId:p.rawId, label:`${p.network} summary`, shortLabel:p.network, url:p.explorerBest, network:p.network, chainId:p.chainId, entityType:p.entityType, supportsPreview:true, supportsEmbed:false, supportsOpenInNewTab:true, previewStrategy:'SRCDOC_STATIC', priority:i, isRecommended:i===0, resolvedChain:p.resolvedChain, summaryData:p }));
  return { schemaVersion:2, resolvedInput:input, onePage, outputs, resolvedChain:pages.length === 1 ? onePage.resolvedChain : null, recommendedPreviewTypeId:outputs[0]?.typeId || null, agentHint:note, summaryText:`${onePage.network} ${onePage.entityType}` };
}
