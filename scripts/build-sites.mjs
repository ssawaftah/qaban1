import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root=process.cwd();
const app=path.join(root,'artifacts/ghad-concrete');
execFileSync(path.join(app,'node_modules/.bin/vite'), ['build'], {cwd:app,env:{...process.env,BASE_PATH:'/'},stdio:'inherit'});
const types={'.txt':'text/plain; charset=utf-8','.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const assets={};
function visit(dir,prefix='') {for(const file of fs.readdirSync(dir,{withFileTypes:true})){const key=prefix+'/'+file.name, full=path.join(dir,file.name);if(file.isDirectory())visit(full,key);else {const ext=path.extname(file.name);if(!types[ext])throw Error('Unsupported asset: '+key);assets[key]={body:fs.readFileSync(full,'utf8'),type:types[ext]};}}}
visit(path.join(app,'dist/public'));assets['/']=assets['/index.html'];
fs.writeFileSync('worker/assets.generated.ts','export const assets: Record<string,{body:string,type:string}> = '+JSON.stringify(assets)+';');
fs.mkdirSync('dist/server',{recursive:true});fs.mkdirSync('dist/.openai',{recursive:true});
const {buildSync}=await import('../artifacts/api-server/node_modules/esbuild/lib/main.js');
buildSync({entryPoints:['worker/index.ts'],bundle:true,format:'esm',platform:'browser',outfile:'dist/server/index.js'});
fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');
fs.cpSync('drizzle','dist/drizzle',{recursive:true});
fs.writeFileSync('dist/server/package.json','{"type":"module"}');
