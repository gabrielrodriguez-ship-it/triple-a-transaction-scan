import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('src');
const server = http.createServer(async (req,res)=>{
  try {
    const url = new URL(req.url,'http://127.0.0.1:8787');
    if (url.pathname==='/api/lookup' || url.pathname==='/.netlify/functions/lookup') {
      let size=0; const chunks=[];
      for await (const c of req) {size+=c.length;if(size>16000){res.writeHead(413);res.end();return;}chunks.push(c);}
      const body=Buffer.concat(chunks);
      const request=new Request(url,{method:req.method,headers:req.headers,...(body.length?{body}: {})});
      const {default:handler}=await import('../netlify/functions/lookup.mjs');
      const reply=await handler(request);res.writeHead(reply.status,Object.fromEntries(reply.headers));res.end(Buffer.from(await reply.arrayBuffer()));return;
    }
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const data=await readFile(file);
    const type={'.html':'text/html','.js':'text/javascript','.png':'image/png'}[path.extname(file)]||'application/octet-stream';
    res.writeHead(200,{'content-type':type,'x-content-type-options':'nosniff','cache-control':'no-store'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(Number(process.env.PORT||8787),'127.0.0.1',()=>console.log('Triple-A Scan: http://127.0.0.1:8787'));
