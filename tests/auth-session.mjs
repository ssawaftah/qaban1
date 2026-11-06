import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {default:worker}=await import('../dist/server/index.js');
const sql=new DatabaseSync(':memory:');
for(const file of ['0001_initial.sql','0002_authentication.sql'])sql.exec(fs.readFileSync('artifacts/ghad-concrete/migrations/'+file,'utf8'));
const DB={prepare(query){let args=[];return {bind(...v){args=v;return this},async first(){return sql.prepare(query).get(...args)??null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}}}};
const env={DB,ADMIN_USERNAME:'preview',ADMIN_PASSWORD:'Test-only-session-password',APP_BASE_PATH:'/'};
async function call(path, options={}) {return worker.fetch(new Request('https://example.test'+path,options),env)}
assert.equal((await call('/')).status,200);assert.equal((await call('/mixers')).status,200);assert.equal((await call('/api/mixers')).status,401);
let r=await call('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})});assert.equal(r.status,200);
const setCookie=r.headers.get('set-cookie');
assert.match(setCookie,/SameSite=None/);assert.match(setCookie,/Partitioned/);assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/Secure/);
const Cookie=setCookie.split(';')[0];
for (const headers of [{Origin:'https://other.test'},{Origin:'null'},{'Sec-Fetch-Site':'cross-site'}]) {
 assert.equal((await call('/api/auth/logout',{method:'POST',headers:{Cookie,...headers}})).status,403);
}

assert.equal((await call('/api/auth/session',{headers:{Cookie}})).status,200);
r=await call('/api/mixers',{method:'POST',headers:{Cookie,'content-type':'application/json'},body:JSON.stringify({vehicleNumber:'TEST-1',driverName:'سائق تجريبي',tareWeightKg:12000,tareWeighedAt:'2026-11-06'})});
assert.equal(r.status,201,await r.clone().text());
r=await call('/api/mixers',{headers:{Cookie}});assert.equal((await r.json()).length,1);
for(const path of ['/mixers','/archive','/api/operations','/api/summary','/api/auth/session'])assert.equal((await call(path,{headers:{Cookie}})).status,200,path);
r=await call('/api/auth/logout',{method:'POST',headers:{Cookie,Origin:'https://example.test'}});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Partitioned/);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);
assert.equal((await call('/api/auth/session',{headers:{Cookie}})).status,401);
console.log('PASS: embedded cookie attributes, navigation, session persistence, CSRF rejection, explicit logout');
