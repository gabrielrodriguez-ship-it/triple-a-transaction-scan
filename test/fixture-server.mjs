// Synthetic API responses for UI checks only. This file is not deployed.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('src');
http.createServer(async(req,res)=>{
 try{
  if(req.url==='/api/lookup'){
   let body='';for await(const c of req)body+=c;const {input}=JSON.parse(body);
   if(input.endsWith('b'.repeat(64))){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"Scanner temporarily unavailable."}');return;}
   if(input.endsWith('c'.repeat(64))){res.writeHead(429);res.end();return;}
   const onePage={summaryState:'RICH',network:'Polygon',chainId:'polygon',resolvedChain:'polygon',entityType:'tx',rawId:input,fields:[{key:'Status',value:'Confirmed',valueType:'status'},{key:'Native value',value:'0.000000000000000001 POL',valueType:'amount'},{key:'Token transfer 1',value:'10.000001 USDT (token-reported metadata)',valueType:'amount'}],explorerBest:'https://polygonscan.com/tx/'+encodeURIComponent(input),fetchedAt:new Date().toISOString()};
   res.setHeader('content-type','application/json');res.end(JSON.stringify({schemaVersion:2,resolvedInput:input,resolvedChain:'polygon',onePage,outputs:[{typeId:'polygon_tx',rawId:input,label:'Polygon summary',shortLabel:'Polygon',url:onePage.explorerBest,network:'Polygon',chainId:'polygon',entityType:'tx',supportsPreview:true,isRecommended:true,resolvedChain:'polygon',previewStrategy:'SRCDOC_STATIC',summaryData:onePage}]}));return;
  }
  const filename=path.resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!filename.startsWith(root+path.sep))throw Error();
  const data=await fs.readFile(filename);res.setHeader('content-type',filename.endsWith('.js')?'text/javascript':filename.endsWith('.png')?'image/png':'text/html');res.end(data);
 }catch{res.writeHead(404);res.end();}
}).listen(8788,'127.0.0.1',()=>console.log('UI fixtures: http://127.0.0.1:8788'));
