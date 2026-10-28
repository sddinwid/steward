// Real isolated Inventory database/API and shared outbox capture; no installed workflow claim.
import {readFile,readdir,mkdir,writeFile,unlink} from 'node:fs/promises';
import {randomUUID,randomBytes,generateKeyPairSync} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';import {test} from 'node:test';import pg from 'pg';
import {privateDirectory} from '../tools/installer/dist/security.js';
import {createInventoryServer} from '../modules/inventory/dist/server.js';
import {initializeUnitGuard} from '../modules/inventory/dist/item-references.js';
import {canonical,digest,validateManifest,validateCapabilityValue,signPackage,outboxSql,captureSql,resolveCapability} from '../packages/module-sdk/dist/index.js';
import {captureSharedEvents,localEventCaptureSql} from '../packages/module-host/dist/shared-event-capture.js';
const dir='.steward/phase16-inventory-tests',container='steward-inventory-workflow-'+randomUUID(),secret=dir+'/'+container+'.env',password=randomBytes(32).toString('hex');
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const installationId=randomUUID(),entityId=randomUUID(),actor=randomUUID(),token=randomBytes(32).toString('hex');let admin,pool,app;
try{
 await mkdir(dir,{recursive:true});privateDirectory(dir);await writeFile(secret,'POSTGRES_PASSWORD='+password+'\n',{mode:0o600});docker(['run','--rm','-d','--name',container,'--env-file',secret,'-p','127.0.0.1::5432','postgres:17.10-alpine']);
 const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort),connection={host:'127.0.0.1',port,user:'postgres',password};admin=new pg.Pool({...connection,database:'postgres'});
 for(let i=0;;i++){try{await admin.query('SELECT 1');break;}catch(e){if(i===40)throw e;await delay(250);}}
 await admin.query('CREATE DATABASE inventory');pool=new pg.Pool({...connection,database:'inventory'});
 const manifest=JSON.parse(await readFile('modules/inventory/manifest.json','utf8'));validateManifest(manifest);for(const f of(await readdir('modules/inventory/migrations')).sort())await pool.query(await readFile('modules/inventory/migrations/'+f,'utf8'));
 const identity={workerInstallationId:installationId,entityId,moduleId:manifest.moduleId,moduleInstallationId:randomUUID(),packageDigest:'a'.repeat(64)},runtime={installationId,entityId,providerIdentity:identity,configuration:{quantityUnit:'units',integrationsEnabled:true,workflowReplenishmentEnabled:false}};
 await initializeUnitGuard({db:pool,config:runtime.configuration,installationId,entityId,providerIdentity:identity,moduleId:manifest.moduleId,actor:'module-runtime',permissions:[]});
 await pool.query(outboxSql);await pool.query(localEventCaptureSql);await pool.query('CREATE TABLE module_identity(singleton boolean PRIMARY KEY,installation_id uuid,module_id text)');await pool.query('INSERT INTO module_identity VALUES(true,$1,$2)',[installationId,manifest.moduleId]);await pool.query(captureSql(manifest,{installationId,role:'worker',entity:{entityId,displayName:'Synthetic threshold fixture'}},randomUUID()));
 const start=()=>{app=createInventoryServer(pool,token,async()=>manifest.persistence.schemaVersion,async()=>{},'units',runtime,manifest);};start();
 const q=async(method,url,payload,status=200,extra={})=>{const r=await app.inject({method,url,headers:{authorization:'Bearer '+token,'x-steward-actor':actor,'x-steward-permissions':JSON.stringify(['cee.inventory.read','cee.inventory.write']),...extra},...(payload===undefined?{}:{payload})});assert.equal(r.statusCode,status,r.body);return r.json();};
 const update=(r,quantity,status=200)=>q('PUT','/items/'+r.id,{sku:r.sku,name:r.name,quantity,reservedQuantity:0,minStock:r.minStock,revision:r.revision},status);
 const rows=async()=>(await pool.query('SELECT * FROM replenishment_requirements ORDER BY id')).rows;
 const event=manifest.smart.provides.find(c=>c.capabilityId==='inventory.replenishment.observe').events[0];let legacy,stock,retained;
 await test('default replenishment remains on its original Procurement outbox and enabling workflows does not transfer pending work',async()=>{
  legacy=(await q('POST','/items',{sku:'SYN-LEGACY',name:'Synthetic legacy shortage',quantity:1,minStock:5},201)).record;const before=(await pool.query('SELECT command_id,envelope FROM integration_outbox')).rows;assert.equal(before.length,1);runtime.configuration.workflowReplenishmentEnabled=true;legacy=(await update(legacy,2)).record;assert.deepEqual((await pool.query('SELECT command_id,envelope FROM integration_outbox')).rows,before);assert.equal((await rows()).length,1);assert.notEqual((await rows())[0].projection.status,'workflow_requested');
 });
 await test('new workflow shortage records use authoritative quantity without sending Procurement or committing money',async()=>{
  stock=(await q('POST','/items',{sku:'SYN-WORKFLOW',name:'Synthetic workflow shortage',quantity:1.25,minStock:5},201)).record;retained=(await rows()).find(r=>r.projection.status==='workflow_requested');assert(retained);assert.equal(retained.projection.quantity,4);assert.equal(retained.projection.itemId,stock.id);validateCapabilityValue(retained,event.schema);assert.equal((await pool.query('SELECT count(*) n FROM integration_outbox')).rows[0].n,'1');
 });
 await test('same-revision concurrent retries and restart retain one original shortage episode',async()=>{
  const responses=await Promise.all([app.inject({method:'PUT',url:'/items/'+stock.id,headers:{authorization:'Bearer '+token},payload:{sku:stock.sku,name:stock.name,quantity:1.25,minStock:5,revision:stock.revision}}),app.inject({method:'PUT',url:'/items/'+stock.id,headers:{authorization:'Bearer '+token},payload:{sku:stock.sku,name:stock.name,quantity:1.25,minStock:5,revision:stock.revision}})]);assert.deepEqual(responses.map(r=>r.statusCode).sort(),[200,409]);stock=responses.find(r=>r.statusCode===200).json().record;await app.close();start();assert.deepEqual((await rows()).find(r=>r.id===retained.id),retained);assert.equal((await rows()).filter(r=>r.projection.status==='workflow_requested').length,1);
 });
 await test('recovery above the threshold permits a distinct later episode without erasing the first observation',async()=>{
  stock=(await update(stock,10)).record;stock=(await update(stock,1)).record;const observed=(await rows()).filter(r=>r.projection.status==='workflow_requested');assert.equal(observed.length,2);assert.equal(new Set(observed.map(r=>r.id)).size,2);assert.deepEqual(observed.find(r=>r.id===retained.id),retained);
 });
 await test('read-only observation query requires private gateway, local read permission and explicit configuration',async()=>{
  const response=await q('GET','/workflow-requirements');assert.equal(response.records.length,3);for(const row of response.records)validateCapabilityValue(row,event.schema);
  await q('GET','/workflow-requirements',undefined,401,{authorization:'Bearer invalid'});await q('GET','/workflow-requirements',undefined,403,{'x-steward-permissions':'[]'});runtime.configuration.workflowReplenishmentEnabled=false;await q('GET','/workflow-requirements',undefined,403);runtime.configuration.workflowReplenishmentEnabled=true;
 });
 await test('signed shared capture preserves actual source identity, retries failed delivery persistence and leaves Master acknowledgments untouched',async()=>{
  const keys=generateKeyPairSync('ed25519'),trust={publishers:[{publisherId:'test-only',publicKey:keys.publicKey.export({type:'spki',format:'pem'}).toString()}]},descriptor=signPackage({formatVersion:1,publisherId:'test-only',imageId:'sha256:'+'b'.repeat(64),manifest},keys.privateKey.export({type:'pkcs8',format:'pem'}).toString()),scope={descriptor,trust,installationId,entityId,moduleInstallationId:identity.moduleInstallationId,streamIds:[event.streamId],from:new Date(0)};
  await assert.rejects(()=>captureSharedEvents(pool,scope,async()=>{throw Error('Synthetic delivery persistence outage');}),/Synthetic delivery/);const captured=[];assert.equal(await captureSharedEvents(pool,scope,async events=>{captured.push(...events);}),3);assert.equal(await captureSharedEvents(pool,scope,async()=>{throw Error('Unexpected duplicate');}),0);
  for(const e of captured){assert.equal(e.sourceModuleInstallationId,identity.moduleInstallationId);assert.equal(e.sourcePackageDigest,digest(canonical(descriptor)));validateCapabilityValue(e.envelope.payload,event.schema);}
  assert.equal((await pool.query('SELECT count(*) n FROM sync_outbox WHERE acknowledged_at IS NOT NULL')).rows[0].n,'0');assert.equal(captured.filter(e=>e.envelope.payload.projection.status==='workflow_requested').length,2);
 });
 await test('Automation declares the exact event contract and disabled configuration is not a discoverable compatible provider',async()=>{
  const automation=JSON.parse(await readFile('modules/business-automation/manifest.json','utf8'));validateManifest(automation);const capability=manifest.smart.provides.find(c=>c.capabilityId==='inventory.replenishment.observe'),requirement=automation.smart.consumes.find(c=>c.capabilityId===capability.capabilityId),provider={moduleId:manifest.moduleId,moduleVersion:manifest.version,installationId:identity.moduleInstallationId,entityId,packageDigest:'a'.repeat(64),state:'active',configured:true,capability},scope={entityId,permissions:['cee.inventory.read']};assert(resolveCapability(requirement,[provider],scope).selected);assert(!resolveCapability(requirement,[{...provider,configured:false}],scope).selected);assert(!resolveCapability(requirement,[{...provider,entityId:randomUUID()}],scope).selected);
 });
}finally{await app?.close();await pool?.end();await admin?.end();try{docker(['rm','-f',container]);}catch{}await unlink(secret).catch(()=>{});}
