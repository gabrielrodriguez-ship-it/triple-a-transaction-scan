import { InputError } from './errors.mjs';
import { ProviderError } from './providers.mjs';
const headers = { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff' };
const reply = (body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{...headers,...extra}});
export function createHandler(lookup) {
  return async request => {
    if (request.method!=='POST') return reply({error:'Use POST.'},405,{allow:'POST'});
    const origin = request.headers.get('origin');
    if (origin && origin!==new URL(request.url).origin) return reply({error:'Cross-origin requests are not allowed.'},403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({error:'Use application/json.'},415);
    const reader = request.body?.getReader();
    if (!reader) return reply({error:'Enter a lookup input.'},400);
    const chunks=[]; let size=0;
    try {
      while(true) { const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>16000) { await reader.cancel(); return reply({error:'Request is too large.'},413); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset=0; for(const c of chunks) {bytes.set(c,offset);offset+=c.length;}
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (!body || typeof body!=='object' || Array.isArray(body)) return reply({error:'Invalid request.'},400);
      return reply(await lookup(body.input,body.network ?? 'auto'));
    } catch(e) {
      if (e instanceof InputError) return reply({error:e.message},400);
      if (e instanceof SyntaxError) return reply({error:'Invalid JSON.'},400);
      if (e instanceof ProviderError && e.code==='BUSY') return reply({error:'The scanner is busy. Retry shortly.'},429,{'retry-after':'5'});
      return reply({error:'The scanner could not complete this lookup. Retry shortly.'},503);
    }
  };
}
export const rateLimit = { windowLimit:30, windowSize:60, aggregateBy:['ip','domain'] };
