// Runs real frontend logic in an isolated DOM harness without opening a browser or making network requests.
// This does not verify browser layout, native clipboard access, sandbox behavior, or CSP enforcement.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const code=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
const hash='0x'+'a'.repeat(64);
class Element {
 constructor(){this.children=[];this.style={};this.attrs={};this.events={};this._text='';this._html='';this.value='';this.disabled=false;this.className='';this.parentElement=this;this.classList={toggle:()=>false};}
 set textContent(s){this.children=[];this._text=String(s);this._html='';}get textContent(){return this._text+this._html.replace(/<[^>]*>/g,'')+this.children.map(c=>c.textContent).join('');}
 set innerHTML(s){this._html=String(s);this.children=[];this._text='';}get innerHTML(){return this._html;}
 appendChild(c){this.children.push(c);return c;}
 addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
 setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
}
function sample(){const onePage={summaryState:'RICH',network:'Polygon',chainId:'polygon',resolvedChain:'polygon',entityType:'tx',rawId:hash,fields:[{key:'Status',value:'Confirmed',valueType:'status'},{key:'Amount',value:'10.000001 USDT',valueType:'amount'}],explorerBest:'https://polygonscan.com/tx/'+hash};return {resolvedInput:hash,onePage,resolvedChain:'polygon',outputs:[{typeId:'polygon_tx',rawId:hash,label:'Polygon summary',shortLabel:'Polygon',url:onePage.explorerBest,network:'Polygon',chainId:'polygon',entityType:'tx',supportsPreview:true,isRecommended:true,resolvedChain:'polygon',previewStrategy:'SRCDOC_STATIC',summaryData:onePage}]};}
function harness({response=sample(),status=200,storageBroken=false,fetcher}={}){
 const ids=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 ids.get('network').value='auto';
 const values=new Map();const events={};const calls=[];
 const context=vm.createContext({console,URL,AbortSignal,Date,JSON,String,Array,Number,Math,encodeURIComponent,decodeURIComponent,setTimeout:()=>0,clearTimeout:()=>{},
 document:{getElementById:id=>{assert.ok(ids.has(id),'Unknown DOM ID: '+id);return ids.get(id);},createElement:()=>new Element(),documentElement:new Element(),addEventListener:(name,fn)=>events[name]=fn},
 localStorage:{getItem:k=>{if(storageBroken)throw Error('blocked');return values.get(k)||null;},setItem:(k,v)=>{if(storageBroken)throw Error('blocked');values.set(k,v);},removeItem:k=>values.delete(k)},
 window:{location:{hash:''},open:()=>{}},history:{replaceState:(a,b,url)=>calls.push({url})},navigator:{platform:'Mac',clipboard:{writeText:async text=>calls.push({copied:text})}},alert:()=>{},
 fetch:fetcher || (async(url,opts)=>{calls.push({url,opts});return new Response(JSON.stringify(response),{status,headers:{'content-type':'application/json'}});})
 });
 vm.runInContext(code,context);
 return {ids,values,calls,events,run:s=>vm.runInContext(s,context)};
}
test('all frontend DOM references exist in published HTML',()=>{harness();});
test('frontend startup tolerates unavailable local storage',()=>{assert.doesNotThrow(()=>harness({storageBroken:true}));});
test('frontend handles corrupt history JSON',()=>{const h=harness();h.values.set('ta_lookup_history_v8','broken');assert.doesNotThrow(()=>h.run('renderHistory()'));});
test('scan renders actual summary, output chip and internal preview',async()=>{const h=harness();h.ids.get('q').value=hash;await h.run('generateSingle()');assert.match(h.ids.get('summaryBody').textContent,/10.000001 USDT/);assert.equal(h.ids.get('outputList').children.length,1);assert.match(h.ids.get('viewer').srcdoc,/10.000001 USDT/);assert.equal(h.ids.get('gen').disabled,false);});
test('frontend calls only the same-origin API',async()=>{const h=harness();h.ids.get('q').value=hash;await h.run('generateSingle()');const req=h.calls.find(c=>c.opts);assert.equal(req.url,'/api/lookup');assert.equal(JSON.parse(req.opts.body).input,hash);});
test('HTTP outage appears and controls recover',async()=>{const h=harness({status:503,response:{error:'Scanner unavailable.'}});h.ids.get('q').value=hash;await h.run('generateSingle()');assert.match(h.ids.get('summaryBody').textContent,/Scanner unavailable/);assert.equal(h.ids.get('gen').disabled,false);});
test('rate limit gives explicit retry instruction',async()=>{const h=harness({status:429});h.ids.get('q').value=hash;await h.run('generateSingle()');assert.match(h.ids.get('summaryBody').textContent,/Wait a minute/);});
test('network failure is handled without uncaught rejection',async()=>{const h=harness({fetcher:async()=>{throw Error('offline');}});h.ids.get('q').value=hash;await h.run('generateSingle()');assert.match(h.ids.get('summaryBody').textContent,/unreachable/);});
test('malformed backend response is handled',async()=>{const h=harness({response:{unexpected:1}});assert.equal((await h.run(`buildLookupResult('${hash}')`)).onePage.summaryState,'FETCH_FAILED');});
test('not found state is visibly distinct',async()=>{const h=harness({response:{resolvedInput:hash,outputs:[],onePage:{summaryState:'NOT_FOUND',fields:[]}}});h.ids.get('q').value=hash;await h.run('generateSingle()');assert.match(h.ids.get('summaryBody').textContent,/Not found/);});
test('editing input clears stale transaction and preview',async()=>{const h=harness();h.ids.get('q').value=hash;await h.run('generateSingle()');h.ids.get('q').events.input[0]();assert.equal(h.ids.get('outputList').children.length,0);assert.equal(h.ids.get('viewerWrap').style.display,'none');assert.equal(h.run('lastResult'),null);});
test('duplicate submission is suppressed',async()=>{let resolve;let count=0;const h=harness({fetcher:()=>{count++;return new Promise(r=>resolve=r);}});h.ids.get('q').value=hash;const pending=h.run('generateSingle()');await h.run('generateSingle()');assert.equal(count,1);resolve(Response.json(sample()));await pending;});
test('edited input prevents old response from overwriting screen',async()=>{let resolve;const h=harness({fetcher:()=>new Promise(r=>resolve=r)});h.ids.get('q').value=hash;const pending=h.run('generateSingle()');h.ids.get('q').events.input[0]();resolve(Response.json(sample()));await pending;assert.equal(h.run('lastResult'),null);assert.equal(h.ids.get('gen').disabled,false);});
test('invoice is absent from history and permalink',async()=>{const h=harness({response:{resolvedInput:'lnbc1test',outputs:[],onePage:{entityType:'invoice',network:'Lightning',summaryState:'LIMITED',fields:[]}}});h.ids.get('q').value='lnbc1test';await h.run('generateSingle()');assert.ok(![...h.values.values()].some(v=>v.includes('lnbc1test')));assert.ok(!h.calls.some(c=>c.url?.includes('lnbc1test')));});
test('provider strings are HTML escaped in preview',()=>{const h=harness();assert.equal(h.run(`esc('<img src=x onerror="alert(1)">')`),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');});
test('support summary contains actual links',()=>{const h=harness();const r=sample();assert.match(h.run(`makeSupportSummary(${JSON.stringify(r)})`),/Polygon summary: https:\/\/polygonscan.com/);});
test('unsafe explorer URLs are rejected',()=>{const h=harness();for(const s of ['javascript:alert(1)','https://etherscan.io.evil.test/tx/abc','https://user:pass@etherscan.io/tx/abc'])assert.equal(h.run(`safeUrl(${JSON.stringify(s)})`),'');});
test('bulk scan renders each item',async()=>{const h=harness();h.ids.get('bulk').value=hash+'\n'+hash;await h.run('generateBulk()');assert.match(h.ids.get('bulkResults').textContent,/2 items/);});
test('static page executes no inline scripts and preview has no script privileges',()=>{assert.ok(!html.includes('allow-scripts'));assert.match(html,/<script src="\/app.js" defer><\/script>/);assert.ok(!html.includes('onerror='));});
test('bulk limits a request batch to twenty inputs',async()=>{const h=harness();h.ids.get('bulk').value=Array(21).fill(hash).join('\n');await h.run('generateBulk()');assert.equal(h.calls.filter(c=>c.opts).length,20);});
test('changing network invalidates the last result',async()=>{const h=harness();h.ids.get('q').value=hash;await h.run('generateSingle()');h.ids.get('network').events.change[0]();assert.equal(h.run('lastResult'),null);assert.equal(h.ids.get('viewerWrap').style.display,'none');});

test('pending lookup shows loader, hides old results and disables result actions',async()=>{
 let resolve;const h=harness({fetcher:()=>new Promise(r=>resolve=r)});h.ids.get('q').value=hash;
 const pending=h.run('generateSingle()');
 assert.equal(h.ids.get('lookupStatus').hidden,false);
 assert.equal(h.ids.get('mainGrid').getAttribute('aria-busy'),'true');
 assert.equal(h.ids.get('mainGrid').style.display,'none');
 assert.equal(h.ids.get('copySummary').disabled,true);
 resolve(Response.json(sample()));await pending;
 assert.equal(h.ids.get('lookupStatus').hidden,true);
 assert.equal(h.ids.get('mainGrid').getAttribute('aria-busy'),'false');
 assert.equal(h.ids.get('mainGrid').style.display,'grid');
 assert.equal(h.ids.get('copySummary').disabled,false);
 assert.match(h.ids.get('summaryBody').textContent,/10.000001 USDT/);
});
test('failed lookup clears loader and restores usable controls',async()=>{
 const h=harness({fetcher:async()=>{throw Error('offline');}});h.ids.get('q').value=hash;await h.run('generateSingle()');
 assert.equal(h.ids.get('lookupStatus').hidden,true);
 assert.equal(h.ids.get('gen').disabled,false);
 assert.equal(h.ids.get('mainGrid').style.display,'grid');
 assert.match(h.ids.get('summaryBody').textContent,/unreachable/);
});
test('editing a pending lookup clears loader and rejects its stale result',async()=>{
 let resolve;const h=harness({fetcher:()=>new Promise(r=>resolve=r)});h.ids.get('q').value=hash;
 const pending=h.run('generateSingle()');h.ids.get('q').events.input[0]();
 assert.equal(h.ids.get('lookupStatus').hidden,true);
 resolve(Response.json(sample()));await pending;
 assert.equal(h.run('lastResult'),null);assert.equal(h.ids.get('lookupStatus').hidden,true);
});
test('bulk progress counts completed responses and clears when finished',async()=>{
 const resolvers=[];const h=harness({fetcher:()=>new Promise(r=>resolvers.push(r))});
 h.run('setMode(true)');h.ids.get('bulk').value=hash+'\n'+hash;
 const pending=h.run('generateBulk()');assert.equal(h.ids.get('lookupDetail').textContent,'0 of 2 checked');
 resolvers[0](Response.json(sample()));
 // Let JSON body parsing and the next lookup reach the mocked fetch.
 for(let n=0;n<30 && resolvers.length<2;n++)await new Promise(r=>setImmediate(r));
 assert.equal(resolvers.length,2);assert.equal(h.ids.get('lookupDetail').textContent,'1 of 2 checked');
 resolvers[1](Response.json(sample()));await pending;
 assert.equal(h.ids.get('lookupStatus').hidden,true);
 assert.equal(h.ids.get('bulkResults').style.display,'block');assert.equal(h.ids.get('mainGrid').style.display,'none');
 assert.match(h.ids.get('bulkResults').textContent,/2 items/);
});
