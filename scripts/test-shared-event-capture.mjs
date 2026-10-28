// Isolated PostgreSQL durability checks. Not subscription governance or deployed automation acceptance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,generateKeyPairSync} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {outboxSql,signPackage} from '../packages/module-sdk/dist/index.js';
import {captureSharedEvents,localEventCaptureSql} from '../packages/module-host/dist/shared-event-capture.js';
import {privateDirectory} from '../tools/installer/dist/security.js';
const dir='.steward/phase16-event-tests',container='steward-event-test-'+randomUUID(),secretFile=dir+'/'+container+'.env';
const installationId=randomUUID(),entityId=randomUUID(),moduleInstallationId=randomUUID(),password=randomBytes(32).toString('hex');
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const keys=generateKeyPairSync('ed25519'),privateKey=keys.privateKey.export({type:'pkcs8',format:'pem'}).toString(),trust={publishers:[{publisherId:'isolated-test',publicKey:keys.publicKey.export({type:'spki',format:'pem'}).toString()}]};
const empty={type:'object',additionalProperties:false,properties:{}},schema={type:'object',additionalProperties:false,required:['id','revision','quantity'],properties:{id:{type:'string'},revision:{type:'integer',minimum:1},quantity:{type:'integer',minimum:0}}};
const manifest={manifestVersion:1,sdkVersion:1,moduleId:'fixture.inventory',version:'1.0.0',name:'Synthetic event source',description:'Isolated event capture fixture, not an installed business provider',minimumPlatformVersion:'0.16.0',dependencies:[],requiredPermissions:['storage.own-database'],api:[{operationId:'read',method:'GET',path:'/stock',permission:'fixture.inventory.read'}],ui:[],configurationSchema:empty,persistence:{isolation:'dedicated-database',schemaVersion:1,migrations:[{version:1,sha256:'a'.repeat(64)}],destructiveRollback:false},integrationEvents:[],analyticalCapabilities:[],replication:{contractVersion:1,streams:[{streamId:'inventory_stock',table:'stock',idColumn:'id',revisionColumn:'revision',columns:['id','revision','quantity']}]},smart:{version:1,provides:[{capabilityId:'inventory.observe',contract:'inventory.observe',version:'1.0.0',operations:[{name:'read',command:'read',input:empty,output:empty,permission:'fixture.inventory.read',mode:'sync',idempotency:'required',retry:'safe'}],events:[{name:'stock.changed',streamId:'inventory_stock',schema}],sensitivity:'business',scope:'entity',ownership:'provider'}],consumes:[],prerequisites:{configuration:{},requiresActive:true,requiresHealthy:true}}};
const descriptor=signPackage({formatVersion:1,publisherId:'isolated-test',imageId:'sha256:'+'a'.repeat(64),manifest},privateKey);
const scope={descriptor,trust,installationId,entityId,moduleInstallationId,streamIds:['inventory_stock'],from:new Date(0)};
let admin,source,receipts;
const report={scope:'Isolated signed source, shared outbox and separate PostgreSQL receipt database. Receipt callback is a synthetic idempotent sink; no deployed subscription or authorization claim.',checks:[]};
async function check(name,run){await test(name,async()=>{try{await run();report.checks.push({name,status:'passed'});}catch(e){report.checks.push({name,status:'failed',error:e.message});throw e;}});}
function event(){const id=randomUUID();return{envelopeVersion:1,payloadVersion:1,eventId:randomUUID(),source:{installationId,role:'worker',entity:{entityId,displayName:'Synthetic event entity'}},destinationInstallationId:randomUUID(),sequence:'1',occurredAt:new Date().toISOString(),eventType:'record.upsert',moduleId:manifest.moduleId,streamId:'inventory_stock',recordId:id,recordRevision:1,payload:{id,revision:1,quantity:7}};}
async function add(e=event()){await source.query('INSERT INTO sync_outbox(event_id,envelope) VALUES($1,$2)',[e.eventId,e]);return e;}
async function persist(events){const db=await receipts.connect();try{await db.query('BEGIN');for(const e of events){const old=(await db.query('SELECT digest FROM receipts WHERE event_id=$1',[e.eventId])).rows[0];if(old)assert.equal(old.digest,e.digest);else await db.query('INSERT INTO receipts(event_id,digest,envelope) VALUES($1,$2,$3)',[e.eventId,e.digest,e.envelope]);}await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
try{
 await mkdir(dir,{recursive:true});privateDirectory(dir);await writeFile(secretFile,'POSTGRES_PASSWORD='+password+'\n',{mode:0o600});
 docker(['run','--rm','-d','--name',container,'--env-file',secretFile,'-p','127.0.0.1::5432','postgres:17.10-alpine']);
 const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort),connection={host:'127.0.0.1',port,user:'postgres',password};
 admin=new pg.Pool({...connection,database:'postgres'});for(let i=0;;i++){try{await admin.query('SELECT 1');break;}catch(e){if(i===40)throw e;await delay(250);}}
 await admin.query('CREATE DATABASE source');await admin.query('CREATE DATABASE receipts');source=new pg.Pool({...connection,database:'source'});receipts=new pg.Pool({...connection,database:'receipts'});
 await source.query(outboxSql);await source.query('CREATE TABLE module_identity(singleton boolean PRIMARY KEY,installation_id uuid,module_id text)');await source.query('INSERT INTO module_identity VALUES(true,$1,$2)',[installationId,manifest.moduleId]);
 await receipts.query('CREATE TABLE receipts(event_id uuid PRIMARY KEY,digest text NOT NULL,envelope jsonb NOT NULL)');
 await check('additive local progress is repeatable and preserves existing Master acknowledgment state',async()=>{
  const e=await add();await source.query('UPDATE sync_outbox SET acknowledged_at=now() WHERE event_id=$1',[e.eventId]);
  const before=(await source.query('SELECT acknowledged_at FROM sync_outbox WHERE event_id=$1',[e.eventId])).rows[0].acknowledged_at;
  await source.query(localEventCaptureSql);await source.query(localEventCaptureSql);assert.equal(await captureSharedEvents(source,scope,persist),1);
  const row=(await source.query('SELECT * FROM sync_outbox WHERE event_id=$1',[e.eventId])).rows[0];assert.equal(row.acknowledged_at.getTime(),before.getTime());assert(row.local_captured_at);
 });
 await check('local consumers advance while every new event remains unacknowledged by Master',async()=>{
  const events=await Promise.all([add(),add(),add()]);assert.equal(await captureSharedEvents(source,scope,persist),3);
  assert.equal(Number((await source.query('SELECT count(*) n FROM sync_outbox WHERE event_id=ANY($1::uuid[]) AND acknowledged_at IS NULL AND local_captured_at IS NOT NULL',[events.map(e=>e.eventId)])).rows[0].n),3);
 });
 await check('lost source acknowledgment replays the original event without duplicate receipts',async()=>{
  const e=await add();await assert.rejects(captureSharedEvents(source,scope,async events=>{await persist(events);throw Error('Interrupted after receipt commit');}),/Interrupted/);
  assert.equal((await source.query('SELECT local_captured_at FROM sync_outbox WHERE event_id=$1',[e.eventId])).rows[0].local_captured_at,null);
  assert.equal(await captureSharedEvents(source,scope,persist),1);assert.equal(Number((await receipts.query('SELECT count(*) n FROM receipts WHERE event_id=$1',[e.eventId])).rows[0].n),1);
 });
 await check('concurrent capture uses row locks and never duplicates source delivery claims',async()=>{
  await Promise.all([add(),add(),add()]);const calls=[];
  const sink=async events=>{calls.push(...events.map(e=>e.eventId));await delay(40);await persist(events);};
  const results=await Promise.all([captureSharedEvents(source,scope,sink),captureSharedEvents(source,scope,sink)]);
  assert.equal(results.reduce((a,b)=>a+b,0),3);assert.equal(new Set(calls).size,3);
 });
 await check('revoked subscriber acceptance leaves the source event pending',async()=>{
  const e=await add();await assert.rejects(captureSharedEvents(source,scope,async()=>{throw Error('SUBSCRIPTION_REVOKED');}),/SUBSCRIPTION_REVOKED/);
  assert.equal((await source.query('SELECT local_captured_at FROM sync_outbox WHERE event_id=$1',[e.eventId])).rows[0].local_captured_at,null);
  await captureSharedEvents(source,scope,persist);
 });
 await check('unknown signed streams, altered packages and wrong installation cannot capture',async()=>{
  await assert.rejects(captureSharedEvents(source,{...scope,streamIds:['private_stream']},persist),/SIGNED_EVENT_SCHEMA_REQUIRED/);
  await assert.rejects(captureSharedEvents(source,{...scope,installationId:randomUUID()},persist),/EVENT_CAPTURE_IDENTITY_INVALID/);
  const altered=structuredClone(descriptor);altered.payload.manifest.name='Unsigned modification';await assert.rejects(captureSharedEvents(source,{...scope,descriptor:altered},persist));
 });
 await check('cross-entity payloads fail before receipts and remain available for diagnosis',async()=>{
  const e=event();e.source.entity.entityId=randomUUID();await add(e);await assert.rejects(captureSharedEvents(source,scope,persist),/EVENT_CAPTURE_IDENTITY_INVALID/);
  assert.equal(Number((await receipts.query('SELECT count(*) n FROM receipts WHERE event_id=$1',[e.eventId])).rows[0].n),0);
  assert.equal((await source.query('SELECT local_captured_at FROM sync_outbox WHERE event_id=$1',[e.eventId])).rows[0].local_captured_at,null);
 });
 report.status=report.checks.every(c=>c.status==='passed')?'passed':'failed';
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;}finally{await Promise.all([source?.end(),receipts?.end(),admin?.end()]);try{docker(['rm','-f',container]);}catch{}await unlink(secretFile).catch(()=>{});await mkdir('artifacts',{recursive:true});await writeFile('artifacts/phase16-shared-event-capture.json',JSON.stringify(report,null,2)+'\n');}
