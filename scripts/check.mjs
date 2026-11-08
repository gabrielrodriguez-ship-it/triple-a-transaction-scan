import path from 'node:path';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
for(const dir of ['lib','netlify/functions','scripts','test','src']) {
 for(const file of await readdir(dir))if(/\.(mjs|js)$/.test(file))execFileSync(process.execPath,['--check',`${dir}/${file}`]);
}
const html=await readFile('src/index.html','utf8');
if(/<script(?![^>]*src=)[^>]*>\s*\S/.test(html))throw Error('Inline executable script found.');
if(/allow-scripts/.test(html))throw Error('Preview scripts must be disabled.');
const app=await readFile('src/app.js','utf8');
if(/eth_getTransaction|HELIUS_API_KEY|api-key=|decodeLightningInvoiceBasic|const REG/.test(app))throw Error('Legacy provider code or secrets in frontend.');
await mkdir('work',{recursive:true});
// Read sources through Node. This also supports managed macOS hosts where the native builder cannot read Documents directly.
const bundled = await build({entryPoints:['./netlify/functions/lookup.mjs'],bundle:true,platform:'node',format:'esm',target:'node22',write:false,packages:'external',plugins:[{
 name:'workspace-sources',setup(builder){
  builder.onResolve({filter:/.*/},args=>args.path.startsWith('.') || path.isAbsolute(args.path)
   ? {path:path.resolve(args.importer ? path.dirname(args.importer) : process.cwd(),args.path),namespace:'workspace'}
   : {path:args.path,external:true});
  builder.onLoad({filter:/.*/,namespace:'workspace'},async args=>({contents:await readFile(args.path,'utf8'),loader:'js'}));
 }
}]});
const {writeFile}=await import('node:fs/promises');
await writeFile('work/lookup-bundle.mjs',bundled.outputFiles[0].text);
await import('../work/lookup-bundle.mjs');
console.log('Syntax, frontend boundaries and production function import passed.');
