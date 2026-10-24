import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {request} from 'node:https';
import path from 'node:path';
import {directory,compose} from './lib.mjs';
import {digest} from '../packages/module-sdk/dist/index.js';
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');process.env.STEWARD_DEMO_RETRY_LOGIN='1';
const {api,logins,waitFor,deployment}=await import('./phase4-client.mjs');await logins();
const config=JSON.parse(await readFile(path.join(directory,'commerce/private/shopify/config.json'),'utf8')),ca=await readFile(path.join(directory,'security/ca-cert.pem')),account=config.accounts[2],port=18443+deployment.instances[0].apiPort-4100;
assert.equal(config.provider,'shopify');assert(account.shopDomain.startsWith('synthetic-'));assert.equal(JSON.parse(await readFile(path.join(directory,'commerce/manifest.json'),'utf8')).simulators,true);
const report={startedAt:new Date().toISOString(),simulation:true,checks:[]};
const connection=async()=>(await api('worker-3','/api/v3/modules/cee.shopify/api/connections')).value.records[0];
const rows=()=>compose('exec','-T','worker-3-db','psql','-U','postgres','-d','m_'+digest('cee.sales').slice(0,20),'-At','-c',"SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM business_records t");
function fault(value){return new Promise((resolve,reject)=>{const data=JSON.stringify({shopId:account.shopId,action:'fault',fault:value}),req=request({hostname:'127.0.0.1',port,path:'/__sim/control',method:'POST',ca,servername:'shopify-simulator',rejectUnauthorized:true,timeout:5000,headers:{authorization:'Bearer '+config.adminToken,'content-type':'application/json'}},res=>{res.resume();res.on('end',()=>res.statusCode===200?resolve():reject(Error('Simulator control failed')));});req.on('error',reject);req.on('timeout',()=>req.destroy());req.end(data);});}
try{
 const before=rows();for(const [name,value,expected]of [
  ['rate limit',{count:1,status:429},'CONNECTOR_RATE_LIMITED'],['credential/scope rejection',{count:1,status:401},'CONNECTOR_CREDENTIAL_OR_SCOPE_REJECTED'],['malformed response',{count:1,malformed:true},'CONNECTOR_MALFORMED_RESPONSE'],['bounded provider timeout',{count:1,delayMs:6000},'CONNECTOR_UNAVAILABLE']
 ]){const at=Date.now();await fault(value);await waitFor(async()=>{const r=await connection();return r.status==='connection_unavailable'&&r.error===expected;},name+' visible error',90000);assert.equal(rows(),before);await fault({count:0});await waitFor(async()=>(await connection()).status==='available',name+' recovery',90000);assert.equal(rows(),before);report.checks.push({name,error:expected,elapsedMs:Date.now()-at,authoritativeSalesRecordsPreserved:true});console.log('PASS deployed connector '+name+' and bounded recovery');}
 report.status='passed';
}catch(e){report.status='failed';report.error=e.message;throw e;}finally{await fault({count:0}).catch(()=>{});report.finishedAt=new Date().toISOString();await writeFile('artifacts/phase8-connector-failures.json',JSON.stringify(report,null,2)+'\n');}
