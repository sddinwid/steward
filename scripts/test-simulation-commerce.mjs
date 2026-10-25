import {execFileSync} from 'node:child_process';
import {readFile,readdir,mkdir,writeFile,rm} from 'node:fs/promises';
import {randomUUID,randomBytes,generateKeyPairSync} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import Fastify from 'fastify';
import {securityMigration} from '../packages/platform/dist/security/migration.js';
import {moduleMigration} from '../packages/platform/dist/module-migration.js';
import {smartMigration} from '../packages/platform/dist/smart-migration.js';
import {commerceMigration,commerceGovernanceMigration} from '../packages/platform/dist/commerce-migration.js';
import {simulationRoutingMigration} from '../packages/module-host/dist/simulation-routing.js';
import {authentication,createAccount} from '../packages/platform/dist/security/auth.js';
import {smartModuleRoutes} from '../packages/platform/dist/smart-modules.js';
import {routeSmartCommand} from '../packages/module-host/dist/smart-routing.js';
import {canonical,digest,signPackage,validateManifest,validateCapabilityValue,capabilityConfigured} from '../packages/module-sdk/dist/index.js';
import {createBusinessServer} from '../packages/business-kit/dist/index.js';
import {privateDirectory} from '../tools/installer/dist/security.js';
import {sales} from '../modules/sales/dist/definition.js';
import {stockLedger} from '../modules/stock-ledger/dist/definition.js';
import {simulationCommerce,simulationCommerceBackground} from '../modules/simulation-commerce/dist/definition.js';
import {simulationFulfillment,simulationFulfillmentBackground} from '../modules/simulation-fulfillment/dist/definition.js';
import {sampleOrder,SIMULATION_SCENARIOS} from '../packages/simulation-kit/dist/index.js';

// Only fixture databases are created here. Every operational mutation below goes
// through a real module API or its durable, authenticated SSMA command inbox.
const dir='.steward/simulation-commerce-tests/'+randomUUID(),container='steward-simulation-commerce-'+randomUUID();
await mkdir(dir,{recursive:true});privateDirectory(dir);
const docker=a=>execFileSync('docker',a,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const pools=[],apps=[],modules=new Map(),checks=[],installationId=randomUUID(),entityId=randomUUID();
const identity={configVersion:1,role:'worker',installationId,entity:{entityId,displayName:'Synthetic service fixture'}};
const key=generateKeyPairSync('ed25519'),privateKey=key.privateKey.export({type:'pkcs8',format:'pem'}).toString(),trust={publishers:[{publisherId:'fixture',publicKey:key.publicKey.export({type:'spki',format:'pem'}).toString()}]};
const password=randomBytes(32).toString('hex'),adminPassword=randomBytes(32).toString('base64url');
await writeFile(dir+'/pg.env','POSTGRES_PASSWORD='+password+'\n',{mode:0o600});
const read=async(id,kind)=>(await modules.get(id).pool.query('SELECT * FROM business_records WHERE kind=$1 ORDER BY created_at,id',[kind])).rows;
const engineId='steward.simulation.commerce',fakeId='steward.simulation.fulfillment';
let db,core,commandCount=0;
async function check(name,fn){await test(name,async()=>{const at=performance.now();try{await fn();checks.push({name,passed:true,elapsedMs:Math.round(performance.now()-at)});}catch(e){checks.push({name,passed:false,error:e.message});throw e;}});}
async function delivery(){
 let count=0;
 for(const source of modules.values())for(const c of (await source.api('GET','/integration-outbox')).commands){
  const routed=await routeSmartCommand(db,c,source.manifest,trust,installationId),target=modules.get(routed.command.targetModuleId);
  const headers={authorization:'Bearer '+target.token,'x-steward-integration-source':source.manifest.moduleId,'x-steward-installation':installationId,'x-steward-capability':c.capability.capabilityId};
  const response=await target.app.inject({method:'POST',url:'/integration-inbox',headers,payload:routed.command});
  assert([200,400,403,409,422].includes(response.statusCode),c.command+': '+response.body);const receipt=response.json();
  // The framework uses durable rejection receipts for domain validation failures.
  const rejected=response.statusCode!==200;
  const replay=await target.app.inject({method:'POST',url:'/integration-inbox',headers,payload:routed.command});assert.equal(replay.statusCode,response.statusCode);assert.deepEqual(replay.json(),receipt);
  if(!rejected)validateCapabilityValue(receipt,routed.operation.output);
  await source.api('POST','/integration-ack',{commandId:c.commandId,digest:digest(canonical(c)),status:rejected?'rejected':'delivered',result:{...receipt,_steward:{providerModuleId:target.manifest.moduleId,packageDigest:digest(canonical(target.descriptor))}}});
  count++;commandCount++;
 }
 return count;
}
async function tick(){await delivery();for(const [id,background]of [[fakeId,simulationFulfillmentBackground],[engineId,simulationCommerceBackground]]){const f=modules.get(id);await background(f.pool,f.runtime);}await delivery();}
async function until(fn,label,timeout=65000){const end=Date.now()+timeout;do{await tick();const value=await fn();if(value)return value;await delay(120);}while(Date.now()<end);throw Error('Timed out '+label+' '+JSON.stringify((await read(engineId,'event')).map(e=>({stage:e.data.stage,error:e.data.error})))+' '+JSON.stringify((await read(engineId,'run')).map(r=>r.data)));}
async function action(id,name,record){return(await modules.get(id).api('POST','/'+name+'/'+record.id,{revision:record.revision,requestId:randomUUID()})).record;}
try{
 docker(['run','--rm','-d','--name',container,'--env-file',dir+'/pg.env','-p','127.0.0.1::5432','postgres:17.10-alpine']);
 const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort),connection={host:'127.0.0.1',port,user:'postgres',password};
 db=new pg.Pool({...connection,database:'postgres'});pools.push(db);for(let n=0;;n++){try{await db.query('SELECT 1');break;}catch(e){if(n===30)throw e;await delay(300);}}
 for(const sql of [securityMigration,moduleMigration,smartMigration,commerceMigration,commerceGovernanceMigration,simulationRoutingMigration])await db.query(sql);
 await db.query('CREATE TABLE platform_installation(singleton boolean,installation_id uuid,entity_id uuid)');await db.query('INSERT INTO platform_installation VALUES(true,$1,$2)',[installationId,entityId]);await createAccount(db,'simulation-admin',adminPassword,'local_admin');
 const defs={sales,'stock-ledger':stockLedger,'simulation-commerce':simulationCommerce,'simulation-fulfillment':simulationFulfillment};
 for(const [name,define]of Object.entries(defs)){
  const manifest=JSON.parse(await readFile('modules/'+name+'/manifest.json','utf8'));validateManifest(manifest);
  const database='m_'+digest(name).slice(0,20);await db.query('CREATE DATABASE '+database);const pool=new pg.Pool({...connection,database});pools.push(pool);
  for(const file of (await readdir('modules/'+name+'/migrations')).filter(f=>f.endsWith('.sql')).sort())await pool.query(await readFile('modules/'+name+'/migrations/'+file,'utf8'));
  const configuration=Object.fromEntries(Object.entries(manifest.configurationSchema.properties).filter(([,v])=>Object.hasOwn(v,'default')).map(([k,v])=>[k,v.default]));
  if(manifest.simulation.role==='participant'){configuration.simulationEnabled=true;if(name==='sales'){configuration.simulationPublicationEnabled=true;configuration.currency='EUR';configuration.smartInventory=true;}}
  else configuration.integrationsEnabled=true;
  if(name==='simulation-commerce'){configuration.maximumOrders=1;configuration.cancellationBasisPoints=0;configuration.refundBasisPoints=0;configuration.maximumMemoryBytes=268435456;}
  if(name==='simulation-fulfillment'){configuration.productionMinimumSeconds=1;configuration.productionSpanSeconds=1;configuration.shippingMinimumSeconds=1;configuration.shippingSpanSeconds=1;}
  const runtime={moduleId:manifest.moduleId,installationId,configuration},token=randomBytes(32).toString('hex'),app=createBusinessServer(pool,token,runtime,define(manifest),async()=>manifest.persistence.schemaVersion,async()=>{});apps.push(app);
  const descriptor=signPackage({formatVersion:1,publisherId:'fixture',imageId:'sha256:'+digest(name),manifest},privateKey);
  await db.query("INSERT INTO module_installations(module_id,version,descriptor,configuration,state,operation_id) VALUES($1,$2,$3,$4,'active',$5)",[manifest.moduleId,manifest.version,descriptor,configuration,randomUUID()]);
  const f={pool,app,manifest,descriptor,runtime,token};modules.set(manifest.moduleId,f);
  f.api=async(method,url,body,status=200)=>{const r=await app.inject({method,url,headers:{authorization:'Bearer '+token,'x-steward-actor':'fixture-admin','x-steward-permissions':JSON.stringify([...new Set(manifest.api.map(o=>o.permission))])},...(body===undefined?{}:{payload:body})});assert.equal(r.statusCode,status,name+' '+method+' '+url+': '+r.body);return r.json();};
 }
 const governance=Fastify({logger:false});apps.push(governance);const origin='https://fixture.local',auth=authentication(governance,db,origin);await smartModuleRoutes(governance,db,auth,identity,async()=>({status:200,value:{}}),async()=>trust);governance.setErrorHandler((e,_r,reply)=>reply.code(e.statusCode??500).send({error:e.message}));
 const login=await governance.inject({method:'POST',url:'/api/v2/auth/login',headers:{origin},payload:{username:'simulation-admin',password:adminPassword}});assert.equal(login.statusCode,200);const cookie=login.headers['set-cookie'].split(';')[0],csrf=login.json().csrfToken;
 core=async(url,body,status=200)=>{const r=await governance.inject({method:body?'POST':'GET',url:'/api/v8/smart-modules'+url,headers:{cookie,origin,'x-csrf-token':csrf},...(body?{payload:body}:{})});assert.equal(r.statusCode,status,r.body);return r.json();};
 await check('signed simulation providers resolve independently of ordinary EUR integration configuration',async()=>{
  for(const consumer of modules.values()){
   const bindings=[];for(const requirement of consumer.manifest.smart.consumes.filter(c=>c.capabilityId.startsWith('simulation.'))){
    const target=[...modules.values()].find(m=>m.manifest.smart.provides.some(p=>p.capabilityId===requirement.capabilityId));assert(target);
    const resolved=await core('/resolve',{consumerId:consumer.manifest.moduleId,capabilityId:requirement.capabilityId,preferredProvider:target.manifest.moduleId});assert.equal(resolved.state,'resolved');
    const binding=(await core('/bindings',{bindingId:randomUUID(),consumerId:consumer.manifest.moduleId,capabilityId:requirement.capabilityId,providerId:target.manifest.moduleId,packageDigest:resolved.selected.packageDigest,reason:'Reviewed isolated synthetic service permissions and dataset boundaries.'})).binding;bindings.push(binding);
   }
   if(!bindings.length)continue;const steps=bindings.flatMap(b=>consumer.manifest.smart.consumes.find(c=>c.capabilityId===b.capability_id).operations.map(o=>({bindingId:b.binding_id,operation:o.name}))),workflowId=randomUUID();
   await core('/workflows',{workflowId,name:'Synthetic '+consumer.manifest.moduleId,version:1,consumerId:consumer.manifest.moduleId,steps,reason:'Reviewed synthetic lifecycle operations without any live commerce provider.'});for(const state of ['approve','activate'])await core('/workflows/'+workflowId+'/lifecycle',{action:state,reason:'Reviewed local synthetic provider identities, permissions and ownership.'});
  }
  const s=modules.get('cee.sales');assert.equal(s.runtime.configuration.integrationsEnabled,false);assert.equal(s.runtime.configuration.currency,'EUR');assert(!capabilityConfigured(s.manifest,s.runtime.configuration,s.manifest.smart.provides.find(c=>c.capabilityId==='commerce.orders.manage')));
 });
 let run;
 await check('continuous engine creates a genuine USD Sales order, reserves stock, fulfills and reconciles exact costs',async()=>{
  run=(await modules.get(engineId).api('POST','/runs',{name:'Synthetic lifecycle',seed:7,eventsPerMinute:120,speed:600,shareWithMaster:'yes'},201)).record;
  await action(engineId,'start',run);await until(async()=>{const r=(await read(engineId,'run'))[0];return r.data.state==='paused'&&r.data.eventIndex===1;},'normal order completion');
  const orders=await read('cee.sales','order');assert.equal(orders.length,1);const o=orders[0];assert.equal(o.data.status,'fulfilled');assert.equal(o.data.currency,'USD');assert.equal(o.data.simulation.datasetId,run.id);assert.equal(o.data.financials.basis,'estimated');
  const jobs=await read(fakeId,'job');assert.equal(jobs.length,1);assert.equal(jobs[0].data.status,'shipped');assert.equal(o.data.productionCostCents,jobs[0].data.productionCostCents);assert.equal(o.data.shippingCostCents,jobs[0].data.shippingCostCents);
  const stock=(await read('cee.stock-ledger','item')).find(i=>i.data.sku===o.data.lines[0].sku);assert(stock);assert.equal(stock.data.quantity,500-o.data.lines[0].quantity);
  assert.equal(modules.get('cee.sales').runtime.configuration.currency,'EUR');assert.equal(modules.get('cee.sales').runtime.configuration.integrationsEnabled,false);
 });
 await check('fixed-seed scenario distributions are repeatable and include all nine conditions',async()=>{
  for(const scenario of SIMULATION_SCENARIOS){const a=Array.from({length:40},(_,i)=>sampleOrder(7,i,scenario));assert.deepEqual(a,Array.from({length:40},(_,i)=>sampleOrder(7,i,scenario)));if(scenario==='missing-mapping')assert(a.some(s=>s.missingMapping));if(scenario==='refund-cancellation')assert(a.some(s=>s.refund)&&a.some(s=>s.cancellation));if(scenario==='production-delay')assert(a.every(s=>s.productionDelaySeconds>=2700));}
 });
 await check('pause/stop persist; selective owner-service reset removes only the synthetic dataset',async()=>{
  let current=(await read(engineId,'run'))[0];await action(engineId,'stop',current);const before=current.data.eventIndex;await tick();await tick();assert.equal((await read(engineId,'run'))[0].data.eventIndex,before);
  // Unrelated data is created through the ordinary owner API, with its original EUR configuration intact.
  await modules.get('cee.stock-ledger').api('POST','/items',{sku:'UNRELATED',name:'Ordinary retained stock',quantity:17},201);
  current=(await read(engineId,'run'))[0];await action(engineId,'reset',current);await until(async()=>!(await read(engineId,'run'))[0].data.runId,'selective reset');
  assert.equal((await read('cee.sales','order')).length,0);assert.equal((await read(fakeId,'job')).length,0);const items=await read('cee.stock-ledger','item');assert.equal(items.length,1);assert.equal(items[0].data.sku,'UNRELATED');assert.equal(items[0].data.quantity,17);
 });
 for(const scenario of SIMULATION_SCENARIOS.filter(s=>s!=='normal'))await check('genuine owner-service lifecycle and duplicate receipts: '+scenario,async()=>{
  let seed=7;if(scenario==='missing-mapping')while(!sampleOrder(seed,0,scenario).missingMapping)seed++;if(scenario==='refund-cancellation')while(!sampleOrder(seed,0,scenario).refund)seed++;
  let r=(await read(engineId,'run'))[0];await modules.get(engineId).api('PUT','/runs/'+r.id,{name:r.data.name,revision:r.revision,scenario,seed,speed:600,eventsPerMinute:120,shareWithMaster:'yes'});
  r=(await read(engineId,'run'))[0];await action(engineId,'start',r);
  await until(async()=>(await read(engineId,'run'))[0].data.state==='paused','scenario '+scenario);
  const o=(await read('cee.sales','order'))[0],e=(await read(engineId,'event'))[0];assert(o);assert.equal(o.data.simulation.scenario,scenario);assert.equal(o.data.simulation.seed,seed);
  if(['missing-mapping','inventory-shortage'].includes(scenario)){assert.equal(e.data.stage,'exception');assert(o.data.reservationFailure||o.data.reservationEvidence?.some(l=>l.reserved<l.requested));}
  else {assert.equal(o.data.status,'fulfilled');const job=(await read(fakeId,'job'))[0];if(scenario==='production-delay')assert(job.data.productionDelaySeconds>=2700);if(scenario==='shipping-increase')assert.equal(job.data.shippingCostCents,1600);if(scenario==='refund-cancellation')assert(o.data.refundCents>0);if(scenario==='purchasing-opportunity')assert(o.data.lines[0].quantity>=8);}
  r=(await read(engineId,'run'))[0];await action(engineId,'reset',r);await until(async()=>!(await read(engineId,'run'))[0].data.runId,'reset '+scenario);assert.equal((await read('cee.stock-ledger','item')).length,1);
 });
}finally{
 for(const app of apps.reverse())await app.close();for(const pool of pools.reverse())await pool.end();try{docker(['rm','-f',container]);}catch{}
 await mkdir('artifacts',{recursive:true});await writeFile('artifacts/phase11-service-lifecycle.json',JSON.stringify({checks,commandCount,finishedAt:new Date().toISOString()},null,2)+'\n');await rm(dir,{recursive:true,force:true});
}


