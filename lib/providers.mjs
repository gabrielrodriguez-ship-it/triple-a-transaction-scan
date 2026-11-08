export class ProviderError extends Error { constructor(code='UNAVAILABLE') { super(code); this.code=code; } }
// Warm-instance bulkheads and Retry-After protection. Fleet-wide ingress limits are set on the function.
export function createTransport({ fetcher = fetch, timeoutMs = 2800, now = Date.now } = {}) {
  const cooldown = new Map(), active = new Map();
  async function json(url, opts = {}, signal) {
    const host = new URL(url).host;
    if ((cooldown.get(host)||0) > now()) throw new ProviderError('RATE_LIMITED');
    if ((active.get(host)||0) >= 8) throw new ProviderError('BUSY');
    active.set(host,(active.get(host)||0)+1);
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const res = await fetcher(url, { ...opts, redirect:'error', signal: signal ? AbortSignal.any([signal,timeout]) : timeout });
      if (res.status === 429) {
        const retry = res.headers.get('retry-after');
        const seconds = /^\d+$/.test(retry||'') ? Number(retry) : (Date.parse(retry)-now())/1000;
        cooldown.set(host, now()+ Math.max(1000,Math.min(60000,Number.isFinite(seconds)?seconds*1000:10000)));
        throw new ProviderError('RATE_LIMITED');
      }
      if (res.status === 404) throw new ProviderError('NOT_FOUND');
      if (!res.ok) throw new ProviderError();
      // Keep the timeout alive through body parsing too.
      const data = await res.json();
      if (!data || typeof data !== 'object') throw new ProviderError('MALFORMED');
      return data;
    } catch (e) { if (e instanceof ProviderError) throw e; throw new ProviderError(signal?.aborted || timeout.aborted ? 'TIMEOUT':'UNAVAILABLE'); }
    finally { active.set(host,Math.max(0,(active.get(host)||1)-1)); }
  }
  async function rpc(url,method,params,signal) {
    const d = await json(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})},signal);
    if (d.error) {
      // Some RPCs return quota errors inside HTTP 200 responses.
      const message = String(d.error.message || '');
      if (d.error.code===-32005 || /rate.?limit|too many requests|quota|credits? (?:limit|exhausted)|compute units? (?:limit|exceeded)/i.test(message)) {
        cooldown.set(new URL(url).host,now()+10000);
        throw new ProviderError('RATE_LIMITED');
      }
      throw new ProviderError('RPC_ERROR');
    }
    if (!Object.hasOwn(d,'result')) throw new ProviderError('RPC_ERROR');
    return d.result;
  }
  return { json, rpc };
}
export function endpoints(chain, env) {
  const configured = env[`${chain.toUpperCase()}_RPC_URLS`];
  if (!configured) return null;
  const urls = configured.split(',').map(s=>s.trim()).filter(Boolean).slice(0,3);
  if (!urls.length || urls.some(s=>{ try { return new URL(s).protocol !== 'https:'; } catch { return true; } })) throw new ProviderError('CONFIGURATION');
  return urls;
}
