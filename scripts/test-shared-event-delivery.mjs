// Isolated PostgreSQL durability checks. Not subscription governance or deployed automation acceptance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,generateKeyPairSync} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {outboxSql,signPackage,canonical,digest} from '../packages/module-sdk/dist/index.js';
import {captureSharedEvents,localEventCaptureSql} from '../packages/module-host/dist/shared-event-capture.js';
import {privateDirectory} from '../tools/installer/dist/security.js';
const dir='.steward/phase16-delivery-tests',container='steward-delivery-test-'+randomUUID(),secretFile=dir+'/'+container+'.env';
const installationId=randomUUID(),entityId=randomUUID(),moduleInstallationId=randomUUID(),password=randomBytes(32).toString('hex');
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const keys=generateKeyPairSync('ed25519'),privateKey=keys.privateKey.export({type:'pkcs8',format:'pem'}).toString(),trust={publishers:[{publisherId:'isolated-test',publicKey:keys.publicKey.export({type:'spki',format:'pem'}).toString()}]};
const empty={type:'object',additionalProperties:false,properties:{}},schema={type:'object',additionalProperties:false,required:['id','revision','quantity'],properties:{id:{type:'string'},revision:{type:'integer',minimum:1},quantity:{type:'integer',minimum:0}}};
const manifest={manifestVersion:1,sdkVersion:1,moduleId:'fixture.inventory',version:'1.0.0',name:'Synthetic event source',description:'Isolated event capture fixture, not an installed business provider',minimumPlatformVersion:'0.16.0',dependencies:[],requiredPermissions:['storage.own-database'],api:[{operationId:'read',method:'GET',path:'/stock',permission:'fixture.inventory.read'}],ui:[],configurationSchema:empty,persistence:{isolation:'dedicated-database',schemaVersion:1,migrations:[{version:1,sha256:'a'.repeat(64)}],destructiveRollback:false},integrationEvents:[],analyticalCapabilities:[],replication:{contractVersion:1,streams:[{streamId:'inventory_stock',table:'stock',idColumn:'id',revisionColumn:'revision',columns:['id','revision','quantity']}]},smart:{version:1,provides:[{capabilityId:'inventory.observe',contract:'inventory.observe',version:'1.0.0',operations:[{name:'read',command:'read',input:empty,output:empty,permission:'fixture.inventory.read',mode:'sync',idempotency:'required',retry:'safe'}],events:[{name:'stock.changed',streamId:'inventory_stock',schema}],sensitivity:'business',scope:'entity',ownership:'provider'}],consumes:[],prerequisites:{configuration:{},requiresActive:true,requiresHealthy:true}}};
const descriptor=signPackage({formatVersion:1,publisherId:'isolated-test',imageId:'sha256:'+'a'.repeat(64),manifest},privateKey);
const scope={descriptor,trust,installationId,entityId,moduleInstallationId,streamIds:['inventory_stock'],from:new Date(0)};

import {securityMigration} from '../packages/platform/dist/security/migration.js';
import {moduleMigration} from '../packages/platform/dist/module-migration.js';
import {smartMigration} from '../packages/platform/dist/smart-migration.js';
import {workflowMigration} from '../packages/platform/dist/workflow-migration.js';
import {sharedEventMigration} from '../packages/platform/dist/shared-event-migration.js';
import {persistSharedEventDeliveries,deliverSharedEvent,replaySharedEvent,verifyEventSubscription} from '../packages/module-host/dist/shared-event-delivery.js';
const consumer=structuredClone(manifest);consumer.moduleId='fixture.automation';consumer.name='Synthetic receipt consumer';delete consumer.replication;
consumer.api=[{operationId:'read',method:'GET',path:'/workflows',permission:'fixture.automation.read'}];
consumer.smart={version:1,provides:[],consumes:[{capabilityId:'inventory.observe',contract:'inventory.observe',minimumVersion:'1.0.0',maximumMajor:1,operations:[{name:'read',input:empty,output:empty}],events:[{name:'stock.changed',schema}],maximumSensitivity:'business',optional:false}],prerequisites:{configuration:{},requiresActive:true,requiresHealthy:true}};
const consumerDescriptor=signPackage({formatVersion:1,publisherId:'isolated-test',imageId:'sha256:'+'b'.repeat(64),manifest:consumer},privateKey);
const consumerInstallation=randomUUID(),actor=randomUUID(),workflow=randomUUID(),binding=randomUUID(),subscription=randomUUID(),deliveryScope={installationId,entityId,trust};
let admin,source,receipts;
const report={scope:'Real isolated PostgreSQL source outbox and governed durable subscriber receipts using signed synthetic providers. Subscription admission and enqueue are explicit fixtures, not deployed workflow or publication acceptance.',checks:[]};
async function check(name,run){let failure;await test(name,async()=>{try{await run();report.checks.push({name,status:'passed'});}catch(e){failure=e;report.checks.push({name,status:'failed',error:e.message});throw e;}});if(failure)throw failure;}
function event(record=randomUUID(),revision=1){return{envelopeVersion:1,payloadVersion:1,eventId:randomUUID(),source:{installationId,role:'worker',entity:{entityId,displayName:'Synthetic event entity'}},destinationInstallationId:randomUUID(),sequence:String(revision),occurredAt:new Date().toISOString(),eventType:'record.upsert',moduleId:manifest.moduleId,streamId:'inventory_stock',recordId:record,recordRevision:revision,payload:{id:record,revision,quantity:7}};}
async function add(e=event()){await source.query('INSERT INTO sync_outbox(event_id,envelope) VALUES($1,$2)',[e.eventId,e]);return e;}
const persist=events=>persistSharedEventDeliveries(receipts,deliveryScope,events);
const capture=()=>captureSharedEvents(source,scope,persist);
async function enqueue(db,s,d){const id=d.event_id;await db.query("INSERT INTO smart_executions(execution_id,workflow_id,actor_id,digest,inputs,state) VALUES($1,$2,$3,$4,$5,'pending') ON CONFLICT DO NOTHING",[id,s.workflow_id,actor,d.digest,d.envelope.payload]);return id;}
const deliver=(work=enqueue)=>deliverSharedEvent(receipts,deliveryScope,work);
const row=async id=>(await receipts.query('SELECT * FROM smart_event_deliveries WHERE event_id=$1',[id])).rows[0];
const retry=async id=>receipts.query("UPDATE smart_event_deliveries SET next_attempt_at=now()-interval '1 second' WHERE event_id=$1",[id]);
try{
 await mkdir(dir,{recursive:true});privateDirectory(dir);await writeFile(secretFile,'POSTGRES_PASSWORD='+password+'\n',{mode:0o600});
 docker(['run','--rm','-d','--name',container,'--env-file',secretFile,'-p','127.0.0.1::5432','postgres:17.10-alpine']);
 const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort),connection={host:'127.0.0.1',port,user:'postgres',password};
 admin=new pg.Pool({...connection,database:'postgres'});for(let i=0;;i++){try{await admin.query('SELECT 1');break;}catch(e){if(i===40)throw e;await delay(250);}}
 await admin.query('CREATE DATABASE source');await admin.query('CREATE DATABASE receipts');source=new pg.Pool({...connection,database:'source'});receipts=new pg.Pool({...connection,database:'receipts'});
 await source.query(outboxSql);await source.query(localEventCaptureSql);await source.query('CREATE TABLE module_identity(singleton boolean PRIMARY KEY,installation_id uuid,module_id text)');await source.query('INSERT INTO module_identity VALUES(true,$1,$2)',[installationId,manifest.moduleId]);
 for(const sql of [securityMigration,moduleMigration,smartMigration,workflowMigration,sharedEventMigration])await receipts.query(sql);
 await receipts.query('ALTER TABLE smart_workflows ADD COLUMN accepting_new boolean NOT NULL DEFAULT true');
 await receipts.query("INSERT INTO security_accounts(account_id,username,password_hash,role) VALUES($1,'isolated-event-admin','unusable-test-hash','local_admin')",[actor]);
 for(const [d,id] of [[descriptor,moduleInstallationId],[consumerDescriptor,consumerInstallation]])await receipts.query("INSERT INTO module_installations(module_id,version,descriptor,configuration,state,operation_id) VALUES($1,'1.0.0',$2,'{}','active',$3)",[d.payload.manifest.moduleId,d,id]);
 await receipts.query("INSERT INTO smart_bindings(binding_id,consumer_id,capability_id,provider_id,provider_installation_id,package_digest,requirement,capability,actor_id,entity_id,state,reason) VALUES($1,$2,'inventory.observe',$3,$4,$5,$6,$7,$8,$9,'approved','Explicit synthetic fixture approval')",[binding,consumer.moduleId,manifest.moduleId,moduleInstallationId,digest(canonical(descriptor)),consumer.smart.consumes[0],manifest.smart.provides[0],actor,entityId]);
 await receipts.query("INSERT INTO smart_workflows(workflow_id,name,version,consumer_id,definition,state,actor_id,reason) VALUES($1,'fixture',1,$2,$3,'active',$4,'Synthetic fixture activation')",[workflow,consumer.moduleId,{format:'module-graph-v1',publication:{moduleInstallationId:consumerInstallation,packageDigest:digest(canonical(consumerDescriptor))}},actor]);
 await receipts.query("INSERT INTO smart_event_subscriptions(subscription_id,workflow_id,binding_id,binding_revision,source_module_installation_id,source_package_digest,consumer_installation_id,consumer_package_digest,event_name,stream_id,event_schema,actor_id,state,reason) VALUES($1,$2,$3,1,$4,$5,$6,$7,'stock.changed','inventory_stock',$8,$9,'active','Explicit synthetic subscriber fixture')",[subscription,workflow,binding,moduleInstallationId,digest(canonical(descriptor)),consumerInstallation,digest(canonical(consumerDescriptor)),schema,actor]);
 await check('capture commits governed receipts before local acknowledgment and leaves Master acknowledgment untouched',async()=>{
  const e=await add();assert.equal(await capture(),1);assert.equal((await row(e.eventId)).state,'pending');assert.equal((await source.query('SELECT acknowledged_at FROM sync_outbox WHERE event_id=$1',[e.eventId])).rows[0].acknowledged_at,null);assert.equal(await deliver(),true);assert.equal((await row(e.eventId)).state,'delivered');
 });
 await check('lost local acknowledgment and concurrent delivery produce one execution',async()=>{
  const e=await add();await assert.rejects(captureSharedEvents(source,scope,async events=>{await persist(events);throw Error('synthetic interruption');}),/synthetic interruption/);await capture();await Promise.all([deliver(),deliver()]);assert.equal(Number((await receipts.query('SELECT count(*) n FROM smart_executions WHERE execution_id=$1',[e.eventId])).rows[0].n),1);
 });
 await check('changed event identities cannot overwrite an existing source revision',async()=>{
  const e=await add();await capture();const conflict={...e,eventId:randomUUID()};await assert.rejects(persist([{eventId:conflict.eventId,envelope:conflict,digest:digest(canonical(conflict)),sourceModuleInstallationId:moduleInstallationId,sourcePackageDigest:digest(canonical(descriptor)),sourceCreatedAt:new Date()}]),/EVENT_IDENTITY_CONFLICT/);await deliver();
 });
 await check('out-of-order retained revisions enqueue causally and late older events are superseded',async()=>{
  const record=randomUUID(),newer=await add(event(record,3)),older=await add(event(record,2));await capture();const seen=[];await deliver(async(...args)=>{seen.push(args[2].record_revision);return enqueue(...args);});await deliver(async(...args)=>{seen.push(args[2].record_revision);return enqueue(...args);});assert.deepEqual(seen,['2','3']);const late=await add(event(record,1));await capture();await deliver();assert.equal((await row(late.eventId)).state,'superseded');assert.equal((await row(newer.eventId)).state,'delivered');assert.equal((await row(older.eventId)).state,'delivered');
 });
 await check('failed enqueue rolls back execution creation and bounded retries reach a durable dead letter',async()=>{
  const e=await add();await capture();for(let n=0;n<5;n++){await deliver(async(...args)=>{await enqueue(...args);throw Error('private service response must not be persisted');});await retry(e.eventId);}const d=await row(e.eventId);assert.equal(d.state,'dead_letter');assert.equal(d.error_code,'EVENT_DELIVERY_UNAVAILABLE');assert.equal((await receipts.query('SELECT 1 FROM smart_executions WHERE execution_id=$1',[e.eventId])).rowCount,0);
  await assert.rejects(replaySharedEvent(receipts,deliveryScope,{subscriptionId:subscription,eventId:e.eventId,actorId:randomUUID(),reason:'Explicit isolated retry after recovery'}),/AUTHORITY_REQUIRED/);
  await replaySharedEvent(receipts,deliveryScope,{subscriptionId:subscription,eventId:e.eventId,actorId:actor,reason:'Explicit isolated retry after recovery'});await deliver();assert.equal((await row(e.eventId)).state,'delivered');await assert.rejects(replaySharedEvent(receipts,deliveryScope,{subscriptionId:subscription,eventId:e.eventId,actorId:actor,reason:'Do not replay a successful business effect'}),/REQUIRES_DEAD_LETTER/);
 });
 await check('a dead-lettered revision blocks its successors but does not starve unrelated records',async()=>{
  const record=randomUUID(),first=await add(event(record,1));await capture();for(let n=0;n<5;n++){await deliver(async()=>{throw Error('EVENT_FIXTURE_FAILURE');});await retry(first.eventId);}const next=await add(event(record,2)),independent=await add();await capture();await deliver();assert.equal((await row(next.eventId)).state,'pending');assert.equal((await row(independent.eventId)).state,'delivered');assert.equal(await deliver(),false);
  await replaySharedEvent(receipts,deliveryScope,{subscriptionId:subscription,eventId:first.eventId,actorId:actor,reason:'Explicit reconciliation cleared isolated failure'});await deliver();await deliver();assert.equal((await row(first.eventId)).state,'delivered');assert.equal((await row(next.eventId)).state,'delivered');
 });
 await check('subscription cutoff uses source persistence time rather than a user-controlled event timestamp',async()=>{
  const e=await add();await source.query("UPDATE sync_outbox SET created_at='2000-01-01' WHERE event_id=$1",[e.eventId]);await capture();assert.equal(await row(e.eventId),undefined);
  const current=event();current.occurredAt='2000-01-01T00:00:00.000Z';await add(current);await capture();assert.equal((await row(current.eventId)).state,'pending');await deliver();
 });
 await check('revocation between capture and delivery blocks enqueue and recovers only after authority returns',async()=>{
  const e=await add();await capture();await receipts.query('UPDATE security_accounts SET enabled=false WHERE account_id=$1',[actor]);let invoked=false;await deliver(async()=>{invoked=true;throw Error('must not execute');});assert.equal(invoked,false);assert.equal((await row(e.eventId)).error_code,'EVENT_APPROVER_REVOKED');await receipts.query('UPDATE security_accounts SET enabled=true WHERE account_id=$1',[actor]);await retry(e.eventId);await deliver();assert.equal((await row(e.eventId)).state,'delivered');
 });
 await check('provider replacement and binding revisions cannot transfer subscriptions or receipts',async()=>{
  const s=(await receipts.query('SELECT * FROM smart_event_subscriptions')).rows[0];await receipts.query('UPDATE smart_bindings SET revision=revision+1 WHERE binding_id=$1',[binding]);await assert.rejects(verifyEventSubscription(receipts,deliveryScope,s),/EVENT_BINDING_CHANGED/);await receipts.query('UPDATE smart_bindings SET revision=1 WHERE binding_id=$1',[binding]);await receipts.query('UPDATE module_installations SET operation_id=$1 WHERE module_id=$2',[randomUUID(),manifest.moduleId]);await assert.rejects(verifyEventSubscription(receipts,deliveryScope,s),/EVENT_PACKAGE_CHANGED/);await receipts.query('UPDATE module_installations SET operation_id=$1 WHERE module_id=$2',[moduleInstallationId,manifest.moduleId]);
 });
 await check('cross-entity scope, unsigned package changes and undeclared event schemas deny disclosure',async()=>{
  const s=(await receipts.query('SELECT * FROM smart_event_subscriptions')).rows[0];await assert.rejects(verifyEventSubscription(receipts,{...deliveryScope,entityId:randomUUID()},s),/EVENT_BINDING_UNAVAILABLE/);await assert.rejects(verifyEventSubscription(receipts,deliveryScope,{...s,event_schema:empty}),/EVENT_SCHEMA_NOT_AUTHORIZED/);const changed=structuredClone(descriptor);changed.payload.manifest.name='unsigned';await receipts.query('UPDATE module_installations SET descriptor=$1 WHERE module_id=$2',[changed,manifest.moduleId]);await assert.rejects(verifyEventSubscription(receipts,deliveryScope,s),/EVENT_PACKAGE_CHANGED/);await receipts.query('UPDATE module_installations SET descriptor=$1 WHERE module_id=$2',[descriptor,manifest.moduleId]);
 });
 await check('history is append-only and source replay cannot silently revive a suspended subscriber',async()=>{
  await assert.rejects(receipts.query("UPDATE smart_event_history SET action='erased'"),/append only/);await receipts.query("UPDATE smart_event_subscriptions SET state='suspended' WHERE subscription_id=$1",[subscription]);const e=await add();await capture();assert.equal(await row(e.eventId),undefined);assert.equal(await deliver(),false);
 });
 report.status='passed';
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;}finally{await Promise.all([source?.end(),receipts?.end(),admin?.end()]);try{docker(['rm','-f',container]);}catch{}await unlink(secretFile).catch(()=>{});await mkdir('artifacts',{recursive:true});await writeFile('artifacts/phase16-shared-event-delivery.json',JSON.stringify(report,null,2)+'\n');}
