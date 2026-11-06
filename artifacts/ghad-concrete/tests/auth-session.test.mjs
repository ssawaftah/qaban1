import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/[[path]].ts';
const sql=new DatabaseSync(':memory:');
for(const file of ['0001_initial.sql','0002_authentication.sql'])sql.exec(fs.readFileSync('migrations/'+file,'utf8'));
const DB={prepare(query){let args=[];return {bind(...v){args=v;return this},async first(){return sql.prepare(query).get(...args)??null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}}}};
const env={DB,ADMIN_USERNAME:'test-admin',ADMIN_PASSWORD:'Test-only-session-password',APP_BASE_PATH:'/'};
async function call(path, options={}) {return onRequest({request:new Request('https://example.test'+path,options),env,next:async()=>new Response('app')})}
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
// Existing archive snapshots must survive later mixer tare changes.
const headers={Cookie,'content-type':'application/json'};
r=await call('/api/operations',{method:'POST',headers,body:JSON.stringify({operationDate:'2026-11-06',mixerId:1,customerName:'عميل اختبار',grossWeightKg:16660})});
assert.equal(r.status,201,await r.clone().text());
const operation=await r.json();assert.equal(operation.tareWeightKg,12000);assert.equal(operation.concreteWeightKg,4660);
r=await call('/api/mixers/1/tare',{method:'POST',headers,body:JSON.stringify({tareWeightKg:13000,tareWeighedAt:'2026-11-07'})});assert.equal(r.status,200);
r=await call('/api/operations?dateFrom=2026-11-06&dateTo=2026-11-06&customerName='+encodeURIComponent('عميل')+'&mixerId=1',{headers:{Cookie}});
const matching=await r.json();assert.equal(matching.length,1);assert.equal(matching[0].tareWeightKg,12000);assert.equal(matching[0].concreteWeightKg,4660);
r=await call('/api/operations/'+operation.id,{method:'PATCH',headers,body:JSON.stringify({operationDate:'2026-11-06',mixerId:1,customerName:'عميل معدّل',grossWeightKg:17000})});assert.equal(r.status,200);assert.equal((await r.json()).concreteWeightKg,5000);
r=await call('/api/operations?dateFrom=2026-11-07',{headers:{Cookie}});assert.equal((await r.json()).length,0);
r=await call('/api/summary',{headers:{Cookie}});assert.equal((await r.json()).totalConcreteKg,5000);
r=await call('/api/operations/'+operation.id,{method:'DELETE',headers:{Cookie}});assert.equal(r.status,204);
r=await call('/api/operations',{headers:{Cookie}});assert.equal((await r.json()).length,0);
r=await call('/api/auth/logout',{method:'POST',headers:{Cookie,Origin:'https://example.test'}});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Partitioned/);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);
assert.equal((await call('/api/auth/session',{headers:{Cookie}})).status,401);
console.log('PASS: Pages authentication, archive CRUD, date/client/mixer filters, historical weights, CSRF, explicit logout');
