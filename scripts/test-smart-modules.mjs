// Real PostgreSQL + authenticated Fastify governance and module-owned inboxes.
// Transport faults below are deliberate test fixtures, not commercial adapters.
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,rm,readFile,rmdir} from 'node:fs/promises';
import {randomBytes,randomUUID,generateKeyPairSync} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test as nodeTest} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import Fastify from 'fastify';
import {securityMigration} from '../packages/platform/dist/security/migration.js';
import {moduleMigration} from '../packages/platform/dist/module-migration.js';
import {smartMigration} from '../packages/platform/dist/smart-migration.js';
import {peerRegistryMigration} from '../packages/platform/dist/peer-migration.js';
import {peerGovernanceMigration} from '../packages/platform/dist/peer-governance-migration.js';
import {peerPurposeMigration} from '../packages/platform/dist/peer-purpose-migration.js';
import {commerceMigration,commerceGovernanceMigration} from '../packages/platform/dist/commerce-migration.js';
import {PostgresDatabase} from '../packages/platform/dist/database.js';
import {syncMigration,syncReliabilityMigration} from '../packages/platform/dist/sync-migration.js';
import {analystMigration} from '../packages/platform/dist/analyst-migration.js';
import {authentication,createAccount} from '../packages/platform/dist/security/auth.js';
import {smartModuleRoutes} from '../packages/platform/dist/smart-modules.js';
import {executeSmartStep} from '../packages/module-host/dist/smart-executor.js';
import {routeSmartCommand} from '../packages/module-host/dist/smart-routing.js';
import {signPackage,canonical,digest} from '../packages/module-sdk/dist/index.js';
import {businessSql,createBusinessServer,find,save,ensure,object,text,amount} from '../packages/business-kit/dist/index.js';
import {privateDirectory} from '../tools/installer/dist/security.js';
const dir='.steward/smart-database-tests',container='steward-smart-tests-'+randomUUID();
await mkdir(dir,{recursive:true});privateDirectory(dir);
const lock=dir+'/run.lock';
try{await mkdir(lock);}catch{throw new Error('Another SSMA database/browser suite owns this fixture. Do not run these suites concurrently.');}
const secretFile=dir+'/'+container+'.env',password=randomBytes(32).toString('hex');
await writeFile(secretFile,'POSTGRES_PASSWORD='+password+'\n',{mode:0o600});
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const pools=[],apps=[];let db;
const browserMode=process.argv.includes('--browser');
const report={verificationVersion:1,startedAt:new Date().toISOString(),scope:'Isolated SSMA kernel acceptance; synthetic module and health-transport fixtures, real PostgreSQL/authentication/inboxes. Not commerce or packaged-release acceptance.',checks:[]};
async function test(name,work){await nodeTest(name,async()=>{const start=performance.now();try{await work();report.checks.push({name,status:'passed',elapsedMs:Math.round(performance.now()-start)});}catch(e){report.checks.push({name,status:'failed',error:e.message,elapsedMs:Math.round(performance.now()-start)});throw e;}});}
const input=object({sku:text(80),quantity:{type:'integer',minimum:1,maximum:100000},orderId:text(36)});
const output=object({sku:text(80),reserved:{type:'integer',minimum:0,maximum:100000}});
const requirement={capabilityId:'inventory.stock.reserve',contract:'steward.stock-reservation',minimumVersion:'1.0.0',maximumMajor:1,operations:[{name:'reserve',input,output}],events:[],maximumSensitivity:'business',optional:false};
const installationId=randomUUID(),entityId=randomUUID(),identity={configVersion:1,role:'worker',installationId,entity:{entityId,displayName:'Isolated synthetic test'}};
const keys=generateKeyPairSync('ed25519'),secret=keys.privateKey.export({type:'pkcs8',format:'pem'}).toString(),publicKey=keys.publicKey.export({type:'spki',format:'pem'}).toString(),trust={publishers:[{publisherId:'test-only',publicKey}]};
function manifest(id,provider=false,retry='safe'){
 return{manifestVersion:1,sdkVersion:1,moduleId:id,version:'1.0.0',name:id,description:'Isolated SSMA acceptance fixture; not an installed commerce adapter.',minimumPlatformVersion:'0.8.0',dependencies:[],requiredPermissions:['storage.own-database'],
 api:[{operationId:'stocks',method:'GET',path:'/stocks',permission:id+'.read'},{operationId:'createStock',method:'POST',path:'/stocks',permission:id+'.write'}],ui:[],configurationSchema:object({integrationsEnabled:{type:'boolean'}}),persistence:{isolation:'dedicated-database',schemaVersion:1,migrations:[{version:1,sha256:'a'.repeat(64)}],destructiveRollback:false},integrationEvents:[],analyticalCapabilities:[],
 integration:{version:1,outboxPath:'/integration-outbox',acknowledgmentPath:'/integration-ack',inboxPath:'/integration-inbox',peers:[]},
 smart:{version:1,provides:provider?[{capabilityId:requirement.capabilityId,contract:requirement.contract,version:'1.0.0',operations:[{name:'reserve',command:'stock.reserve',input,output,permission:id+'.write',mode:'durable',idempotency:'required',retry}],events:[],sensitivity:'business',scope:'entity',ownership:'provider'}]:[],consumes:provider?[]:[requirement],prerequisites:{configuration:{integrationsEnabled:true},requiresActive:true,requiresHealthy:true}}};
}
try{
 docker(['run','--rm','-d','--name',container,'--env-file',secretFile,'-p','127.0.0.1::5432','postgres:17.10-alpine']);
 const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort),connection={host:'127.0.0.1',port,user:'postgres',password};
 db=new pg.Pool({...connection,database:'postgres',max:6});pools.push(db);
 for(let n=0;;n++){try{await db.query('SELECT 1');break;}catch(e){if(n===30)throw e;await delay(500);}}
 await db.query(securityMigration);await db.query(moduleMigration);await db.query(smartMigration);await db.query(commerceMigration);await db.query(commerceGovernanceMigration);await db.query(peerRegistryMigration);await db.query(peerGovernanceMigration);await db.query(peerPurposeMigration);
 await db.query('CREATE TABLE platform_installation(singleton boolean,installation_id uuid,entity_id uuid)');await db.query('INSERT INTO platform_installation VALUES(true,$1,$2)',[installationId,entityId]);
 const adminId=await createAccount(db,'local-admin',randomBytes(24).toString('base64url'),'local_admin');
 const adminPassword=randomBytes(24).toString('base64url'),userPassword=randomBytes(24).toString('base64url');
 // Real password hashing/session/CSRF authorization; no test bypass in production routes.
 const {passwordHash}=await import('../packages/platform/dist/security/crypto.js');
 await db.query('UPDATE security_accounts SET password_hash=$1 WHERE account_id=$2',[await passwordHash(adminPassword),adminId]);
 await createAccount(db,'module-user',userPassword,'module_user');
 const descriptors={},modules=new Map();
 async function install(id,provider=false,retry='safe'){
   const m=manifest(id,provider,retry),descriptor=signPackage({formatVersion:1,publisherId:'test-only',imageId:'sha256:'+digest(id+retry),manifest:m},secret);descriptors[id]=descriptor;
   await db.query("INSERT INTO module_installations(module_id,version,descriptor,configuration,state,operation_id) VALUES($1,'1.0.0',$2,$3,'active',$4)",[id,descriptor,{integrationsEnabled:true},randomUUID()]);
   if(provider){
     const name='m_'+digest(id).slice(0,20);await db.query('CREATE DATABASE '+name);const pool=new pg.Pool({...connection,database:name});pools.push(pool);await pool.query(businessSql);
     const token=randomBytes(32).toString('hex'),definition={manifest:m,resources:[{kind:'stock',path:'/stocks',key:'sku',schema:object({sku:text(80),quantity:amount})}],actions:[],receive:async(c,ctx)=>{
       const r=await find(ctx,'stock',c.payload.sku);ensure(r&&r.data.quantity>=c.payload.quantity,'Insufficient stock',409);
       await save(ctx,'stock',r.key,{...r.data,quantity:r.data.quantity-c.payload.quantity},r);return{sku:r.key,reserved:c.payload.quantity};
     }};
   const app=createBusinessServer(pool,token,{installationId,entityId,configuration:{integrationsEnabled:true}},definition,async()=>1,async()=>{});apps.push(app);modules.set(id,{app,token,pool});
     const result=await app.inject({method:'POST',url:'/stocks',headers:{authorization:'Bearer '+token,'x-steward-permissions':JSON.stringify([id+'.write'])},payload:{sku:'SYN-1',quantity:20}});assert.equal(result.statusCode,201,result.body);
   }
 }
 await install('example.checkout');await install('example.stock-a',true);await install('example.stock-b',true);await install('example.uncertain',true,'reconcile');
 const origin=browserMode?'https://localhost:19471':'https://worker.test';
 let tls;
 if(browserMode){
   const openssl=process.env.STEWARD_OPENSSL??(process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl');
   await writeFile(dir+'/openssl.cnf','[req]\ndistinguished_name=dn\n[dn]\n');
   execFileSync(openssl,['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-config',dir+'/openssl.cnf','-keyout',dir+'/tls-key.pem','-out',dir+'/tls-cert.pem'],{stdio:'ignore'});
   tls={key:await readFile(dir+'/tls-key.pem'),cert:await readFile(dir+'/tls-cert.pem')};
 }
 const app=Fastify({logger:false,...(tls?{https:tls}:{})});apps.push(app);
 const auth=authentication(app,db,origin);
 const unavailable=new Set();
 await smartModuleRoutes(app,db,auth,identity,async(_op,d)=>({status:unavailable.has(d.payload.manifest.moduleId)?503:200,value:{}}),async()=>trust);
 app.setErrorHandler((e,_req,reply)=>reply.code(e.statusCode??500).send({error:e.message}));
 if(browserMode){
   const {build}=await import('vite');
   const result=await build({configFile:false,logLevel:'error',build:{write:false,rollupOptions:{input:'scripts/fixtures/smart-browser.html'}}});
   const files=new Map(result.output.map(o=>['/'+o.fileName,o]));
   app.get('/',(_req,reply)=>reply.type('text/html').send(files.get('/scripts/fixtures/smart-browser.html').source));
   app.get('/assets/:name',(req,reply)=>{const f=files.get('/assets/'+req.params.name);if(!f)return reply.code(404).send();return reply.type(f.fileName.endsWith('.css')?'text/css':'application/javascript').send(f.type==='asset'?f.source:f.code);});
   await app.listen({host:'127.0.0.1',port:19471});
 }
 async function login(username,password){const r=await app.inject({method:'POST',url:'/api/v2/auth/login',headers:{origin,'content-type':'application/json'},payload:{username,password}});assert.equal(r.statusCode,200,r.body);const cookie=r.headers['set-cookie'];return{cookie:(Array.isArray(cookie)?cookie[0]:cookie).split(';')[0],csrf:r.json().csrfToken};}
 const administrator=await login('local-admin',adminPassword),user=await login('module-user',userPassword);
 async function api(path,method='GET',payload,session=administrator,status=200){const r=await app.inject({method,url:'/api/v8/smart-modules'+path,headers:{cookie:session.cookie,origin,'content-type':'application/json','x-csrf-token':session.csrf},...(payload?{payload}:{})});assert.equal(r.statusCode,status,r.body);return r.json();}
 const reason='Reviewed synthetic capability and original provider obligations.';
 async function bind(providerId){const r=await api('/resolve','POST',{consumerId:'example.checkout',capabilityId:requirement.capabilityId,preferredProvider:providerId});assert.equal(r.state,'resolved');const b={bindingId:randomUUID(),consumerId:'example.checkout',capabilityId:requirement.capabilityId,providerId,packageDigest:r.selected.packageDigest,reason};const response=await api('/bindings','POST',b);assert.deepEqual(await api('/bindings','POST',b),response);return response.binding;}
 async function workflow(binding){const workflowId=randomUUID();await api('/workflows','POST',{workflowId,name:'Synthetic '+workflowId,version:1,consumerId:'example.checkout',steps:[{bindingId:binding.binding_id,operation:'reserve'}],reason});await api('/workflows/'+workflowId+'/lifecycle','POST',{action:'activate',reason},administrator,409);for(const action of ['approve','activate'])await api('/workflows/'+workflowId+'/lifecycle','POST',{action,reason});return workflowId;}
 async function enqueue(workflowId){const executionId=randomUUID(),request={executionId,workflowId,inputs:[{sku:'SYN-1',quantity:3,orderId:executionId}]};await api('/execute','POST',request);await api('/execute','POST',request);return executionId;}
 const value=async(id)=>Number((await modules.get(id).pool.query("SELECT data->>'quantity' AS n FROM business_records WHERE kind='stock'")).rows[0].n);
 const state=async(id)=>(await db.query('SELECT * FROM smart_executions WHERE execution_id=$1',[id])).rows[0];
 const call=async(id,method,path,body,headers)=>{const m=modules.get(id);const r=await m.app.inject({method,url:path,headers:{authorization:'Bearer '+m.token,...headers},payload:body});return{status:r.statusCode,value:r.json()};};
 const run=(transport=call,matches=async()=>true)=>executeSmartStep(db,installationId,trust,transport,matches);
 await test('additive upgrade from the actual schema-6 migrations preserves installation, accounts and signed module configuration',async()=>{
   await db.query('CREATE DATABASE upgrade_baseline');const baseline=new pg.Pool({...connection,database:'upgrade_baseline'});pools.push(baseline);
   await baseline.query('CREATE TABLE platform_migrations(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());CREATE TABLE platform_installation(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),installation_id uuid NOT NULL UNIQUE,entity_id uuid NOT NULL,role text NOT NULL CHECK(role IN (\'master\',\'worker\')),created_at timestamptz NOT NULL DEFAULT now())');
   for(const sql of [securityMigration,moduleMigration,syncMigration,syncReliabilityMigration,analystMigration])await baseline.query(sql);
   await baseline.query('INSERT INTO platform_migrations(version) SELECT generate_series(1,6)');await baseline.query("INSERT INTO platform_installation VALUES(true,$1,$2,'worker',now())",[installationId,entityId]);
   await createAccount(baseline,'retained-admin',randomBytes(24).toString('base64url'),'local_admin');
   const legacy=structuredClone(descriptors['example.checkout']);delete legacy.payload.manifest.smart;legacy.payload.manifest.minimumPlatformVersion='0.7.0';
   const signed=signPackage(legacy.payload,secret);
   await baseline.query("INSERT INTO module_installations(module_id,version,descriptor,configuration,state,operation_id) VALUES($1,'1.0.0',$2,$3,'active',$4)",[legacy.payload.manifest.moduleId,signed,{integrationsEnabled:false},randomUUID()]);
   const snapshot=async()=>canonical(await Promise.all(['platform_installation','security_accounts','module_installations'].map(async table=>(await baseline.query('SELECT * FROM '+table+' ORDER BY 1')).rows)));
   const before=await snapshot(),database=new PostgresDatabase({...connection,database:'upgrade_baseline',ssl:false},identity);pools.push(database.pool);
   await database.migrate();await database.check();assert.equal(await snapshot(),before);await database.migrate();await database.check();assert.equal(await snapshot(),before);
   assert.equal((await baseline.query('SELECT max(version) n FROM platform_migrations')).rows[0].n,18);assert.equal((await baseline.query("SELECT to_regclass('simulation_origins') IS NOT NULL AS present")).rows[0].present,true);
 });
 await test('SSMA governance uses real sessions, denies module users and CSRF, and reconstructs only trusted providers',async()=>{
   await api('','GET',undefined,user,403);await api('/resolve','POST',{consumerId:'example.checkout',capabilityId:requirement.capabilityId},user,403);
   await api('/resolve','POST',{consumerId:'example.checkout',capabilityId:requirement.capabilityId},{...administrator,csrf:'bad'},403);
   assert.equal((await api('')).providers.length,3);await db.query('DELETE FROM smart_providers');assert.equal((await api('')).providers.length,3);
   await db.query("UPDATE module_installations SET descriptor=jsonb_set(descriptor,'{signature}','\"invalid\"') WHERE module_id='example.stock-b'");assert.equal((await api('')).providers.length,2);
   await db.query('UPDATE module_installations SET descriptor=$1 WHERE module_id=$2',[descriptors['example.stock-b'],'example.stock-b']);
   unavailable.add('example.stock-b');assert.equal((await api('')).providers.find(p=>p.moduleId==='example.stock-b').state,'unavailable');unavailable.clear();
 });
 await test('approved workflows enforce lifecycle, pin receipts, survive lost ACK, concurrent execution and provider substitution',async()=>{
   const a=await bind('example.stock-a'),w=await workflow(a),executionId=await enqueue(w);let dropped=false;
   await run(async(...args)=>{const result=await call(...args);if(!dropped){dropped=true;throw new Error('lost response after provider commit');}return result;});
   assert.equal(await value('example.stock-a'),17);assert.equal((await state(executionId)).state,'pending');
   await db.query('UPDATE smart_executions SET next_attempt_at=now()');await Promise.all([run(),run()]);assert.equal((await state(executionId)).state,'completed');assert.equal(await value('example.stock-a'),17);
   const pending=await enqueue(w),b=await bind('example.stock-b');await run();assert.equal((await state(pending)).state,'suspended');assert.equal(await value('example.stock-b'),20);
   const w2=await workflow(b),e2=await enqueue(w2);await run();assert.equal((await state(e2)).state,'completed');assert.equal(await value('example.stock-b'),17);assert.equal(await value('example.stock-a'),17);
   const original=(await db.query('SELECT * FROM smart_obligations WHERE aggregate_id=$1',[executionId])).rows[0];assert.equal(original.provider_id,'example.stock-a');
 });
 await test('provider upgrade, reinstall, configuration mismatch, entity mismatch and revoked authority suspend before effects',async()=>{
   for(const fault of ['upgrade','trust','reinstall','configuration','entity','revoke']){
     const b=await bind('example.stock-b'),w=await workflow(b),e=await enqueue(w),row=(await db.query("SELECT * FROM module_installations WHERE module_id='example.stock-b'")).rows[0],before=await value('example.stock-b');
     if(fault==='upgrade')await db.query("UPDATE module_installations SET descriptor=$1,version='1.0.1' WHERE module_id='example.stock-b'",[signPackage({...row.descriptor.payload,imageId:'sha256:'+digest('new-version'),manifest:{...row.descriptor.payload.manifest,version:'1.0.1'}},secret)]);
     if(fault==='trust')await db.query("UPDATE module_installations SET descriptor=$1 WHERE module_id='example.stock-b'",[{...row.descriptor,signature:'tampered'}]);
     if(fault==='reinstall')await db.query("UPDATE module_installations SET operation_id=$1 WHERE module_id='example.stock-b'",[randomUUID()]);
     if(fault==='entity')await db.query('UPDATE smart_bindings SET entity_id=$1 WHERE binding_id=$2',[randomUUID(),b.binding_id]);
     if(fault==='revoke')await db.query('UPDATE security_accounts SET enabled=false WHERE account_id=$1',[adminId]);
     await run(call,async()=>fault!=='configuration');assert.equal((await state(e)).state,'suspended',fault);assert.equal(await value('example.stock-b'),before,fault);
     await db.query('UPDATE security_accounts SET enabled=true WHERE account_id=$1',[adminId]);await db.query('UPDATE module_installations SET descriptor=$1,operation_id=$2,version=$3 WHERE module_id=$4',[row.descriptor,row.operation_id,row.version,row.module_id]);
   }
 });
 await test('capability outbox routing pins real inbox effects and never moves an existing obligation to a substitute',async()=>{
   const binding=await bind('example.stock-a');await workflow(binding);const aggregateId=randomUUID(),command={protocol:'steward-module-integration-v1',commandId:randomUUID(),sourceModuleId:'example.checkout',targetModuleId:'steward.capability',command:'reserve',version:1,aggregateId,sequence:1,occurredAt:new Date().toISOString(),payload:{sku:'SYN-1',quantity:2,orderId:aggregateId},capability:{capabilityId:requirement.capabilityId,operation:'reserve'}};
   const source=descriptors['example.checkout'].payload.manifest;
   await assert.rejects(routeSmartCommand(db,{...command,sequence:2},source,trust,installationId),/SEQUENCE_GAP/);
   const route=await routeSmartCommand(db,command,source,trust,installationId),before=await value('example.stock-a');
   assert.equal(route.command.targetModuleId,'example.stock-a');assert.equal(route.command.command,'stock.reserve');
   const headers={'x-steward-integration-source':command.sourceModuleId,'x-steward-installation':installationId,'x-steward-capability':requirement.capabilityId};
   assert.equal((await call(route.command.targetModuleId,'POST','/integration-inbox',route.command,headers)).status,200);assert.equal(await value('example.stock-a'),before-2);
   const replay=await routeSmartCommand(db,command,source,trust,installationId);assert.deepEqual(replay.command,route.command);assert.equal((await call(replay.command.targetModuleId,'POST','/integration-inbox',replay.command,headers)).status,200);assert.equal(await value('example.stock-a'),before-2);
   await assert.rejects(routeSmartCommand(db,{...command,payload:{...command.payload,quantity:1}},source,trust,installationId),/IDENTITY_MISMATCH/);
   const second=await bind('example.stock-b');await workflow(second);await assert.rejects(routeSmartCommand(db,{...command,commandId:randomUUID(),sequence:2},source,trust,installationId),/APPROVAL_REQUIRED/);
   const fresh={...command,commandId:randomUUID(),aggregateId:randomUUID()},next=await routeSmartCommand(db,fresh,source,trust,installationId);assert.equal(next.command.targetModuleId,'example.stock-b');
   assert.equal((await db.query('SELECT provider_id FROM smart_obligations WHERE aggregate_id=$1',[aggregateId])).rows[0].provider_id,'example.stock-a');
 });
 await test('expected provider restricts approved routing before writes and remains absent from legacy receiver wire',async()=>{
   const binding=await bind('example.stock-a');await workflow(binding);
   const source=descriptors['example.checkout'].payload.manifest;
   const providerConstraint={version:1,workerInstallationId:installationId,entityId,moduleId:binding.provider_id,moduleInstallationId:binding.provider_installation_id,packageDigest:binding.package_digest};
   const aggregateId=randomUUID(),command={protocol:'steward-module-integration-v1',commandId:randomUUID(),sourceModuleId:source.moduleId,targetModuleId:'steward.capability',command:'reserve',version:1,aggregateId,sequence:1,occurredAt:new Date().toISOString(),payload:{sku:'SYN-1',quantity:1,orderId:aggregateId},capability:{capabilityId:requirement.capabilityId,operation:'reserve',providerConstraint}};
   const before=await value('example.stock-a');
   for(const change of [{workerInstallationId:randomUUID()},{entityId:randomUUID()},{moduleId:'example.stock-b'},{moduleInstallationId:randomUUID()},{packageDigest:'f'.repeat(64)}]){
     await assert.rejects(routeSmartCommand(db,{...command,capability:{...command.capability,providerConstraint:{...providerConstraint,...change}}},source,trust,installationId),/PROVIDER_CHANGED/);
     assert.equal((await db.query('SELECT 1 FROM smart_obligations WHERE aggregate_id=$1',[aggregateId])).rowCount,0);
     assert.equal((await db.query('SELECT 1 FROM smart_routes WHERE command_id=$1',[command.commandId])).rowCount,0);
     assert.equal(await value('example.stock-a'),before);
   }
   const routed=await routeSmartCommand(db,command,source,trust,installationId);
   assert.deepEqual(routed.command.capability,{capabilityId:requirement.capabilityId,operation:'reserve'});
   assert.deepEqual((await db.query('SELECT original_envelope FROM smart_routes WHERE command_id=$1',[command.commandId])).rows[0].original_envelope,command);
   const headers={'x-steward-integration-source':source.moduleId,'x-steward-installation':installationId,'x-steward-capability':requirement.capabilityId};
   const sourceRow=(await db.query('SELECT * FROM module_installations WHERE module_id=$1',[source.moduleId])).rows[0];
   const incomingIdentity={workerInstallationId:installationId,entityId,moduleId:source.moduleId,moduleInstallationId:sourceRow.operation_id,packageDigest:digest(canonical(sourceRow.descriptor))};
   for(const change of [{workerInstallationId:randomUUID()},{entityId:randomUUID()},{moduleId:'example.other'},{moduleInstallationId:'bad'},{packageDigest:'bad'},{extra:'forged'}]){
     assert.equal((await call(routed.command.targetModuleId,'POST','/integration-inbox',routed.command,{...headers,'x-steward-source-identity':JSON.stringify({...incomingIdentity,...change})})).status,403);
     assert.equal(await value('example.stock-a'),before);
   }
   assert.equal((await call(routed.command.targetModuleId,'POST','/integration-inbox',routed.command,{...headers,'x-steward-source-identity':JSON.stringify(incomingIdentity)})).status,200);assert.equal(await value('example.stock-a'),before-1);
   await assert.rejects(routeSmartCommand(db,{...command,capability:{capabilityId:requirement.capabilityId,operation:'reserve'}},source,trust,installationId),/IDENTITY_MISMATCH/);
 });
 await test('malformed results suspend without fabricated completion and safe transport failures exhaust a bounded retry budget',async()=>{
   const b=await bind('example.stock-b'),w=await workflow(b),bad=await enqueue(w),before=await value('example.stock-b');
   await run(async(...args)=>{await call(...args);return{status:200,value:{fabricated:'not the signed response schema'}};});assert.equal((await state(bad)).state,'suspended');assert.equal((await state(bad)).error_code,'CAPABILITY_SCHEMA_MISMATCH');assert.equal(await value('example.stock-b'),before-3);
   const timeout=await enqueue(w);let calls=0;
   for(let n=0;n<4;n++){await db.query('UPDATE smart_executions SET next_attempt_at=now() WHERE execution_id=$1',[timeout]);await run(async()=>{calls++;throw new Error('controlled transport timeout');});}
   assert.equal(calls,4);assert.equal((await state(timeout)).state,'suspended');assert.equal(await value('example.stock-b'),before-3);
 });
 await test('non-repeatable submissions keep independent issuance journals and never blindly retry uncertain effects',async()=>{
   const b=await bind('example.uncertain'),w=await workflow(b),e=await enqueue(w);let calls=0;
   await run(async(...args)=>{calls++;await call(...args);throw new Error('connection lost');});assert.equal(await value('example.uncertain'),17);assert.equal((await state(e)).state,'suspended');
   // Simulate a coordinator restart after issuance but before recording completion.
   await db.query("UPDATE smart_executions SET state='pending',next_attempt_at=now() WHERE execution_id=$1",[e]);await run(async(...args)=>{calls++;return call(...args);});
   assert.equal(calls,1);assert.equal((await state(e)).error_code,'UNCERTAIN_OUTCOME_RECONCILE');assert.equal(await value('example.uncertain'),17);
 });

 await test('governance and durable execution use the enrolled legal entity and fail closed if that scope changes',async()=>{
  const legal=randomUUID();await db.query("INSERT INTO local_enrollment(singleton,profile_id,state,entity_id) VALUES(true,'fixture','enrolled',$1)",[legal]);
  try{const discovered=await api('');assert.equal(discovered.entityId,legal);assert(discovered.providers.every(p=>p.entityId===legal));const b=await bind('example.stock-b');assert.equal(b.entity_id,legal);const w=await workflow(b),e=await enqueue(w);await run();assert.equal((await state(e)).state,'completed');const before=await value('example.stock-b'),pending=await enqueue(w);await db.query('UPDATE local_enrollment SET entity_id=$1',[randomUUID()]);await run();assert.equal((await state(pending)).error_code,'ENTITY_SCOPE_MISMATCH');assert.equal(await value('example.stock-b'),before);}
  finally{await db.query('DELETE FROM local_enrollment');}
 });
 await test('one programme can approve distinct capability audiences without transferring existing obligations',async()=>{
  const sourceId='example.scoped-consumer',providers=['example.scoped-training','example.scoped-employer'],sourceProgram=randomUUID(),destinations=[randomUUID(),randomUUID()];
  const scopedInput={...input,required:[...input.required,'programId','sourceProgramId'],properties:{...input.properties,programId:{type:'string'},sourceProgramId:{type:'string'}}};
  const scopedRequirement={...requirement,operations:[{...requirement.operations[0],input:scopedInput}]};
  const manifests={};
  for(const id of [sourceId,...providers]){
   const provider=id!==sourceId,m=manifest(id,provider);m.minimumPlatformVersion='0.13.0';
   if(provider)m.smart.provides[0].operations[0].input=scopedInput;else m.smart.consumes=[scopedRequirement];
   const descriptor=signPackage({formatVersion:1,publisherId:'test-only',imageId:'sha256:'+digest(id),manifest:m},secret);manifests[id]={m,descriptor,installation:randomUUID()};
   await db.query("INSERT INTO module_installations(module_id,version,descriptor,configuration,state,operation_id) VALUES($1,'1.0.0',$2,$3,'active',$4)",[id,descriptor,{integrationsEnabled:true},manifests[id].installation]);
  }
  const bindings=[];
  for(let n=0;n<2;n++){
   const id=randomUUID(),p=manifests[providers[n]],cap=p.m.smart.provides[0];bindings.push(id);
   await db.query("INSERT INTO smart_bindings(binding_id,consumer_id,capability_id,provider_id,provider_installation_id,package_digest,requirement,capability,actor_id,entity_id,state,reason,source_program_id,destination_program_id,purpose,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved',$11,$12,$13,$14,now()+interval '1 day')",[id,sourceId,requirement.capabilityId,providers[n],p.installation,digest(canonical(p.descriptor)),scopedRequirement,cap,adminId,entityId,reason,sourceProgram,destinations[n],'synthetic.pathways']);
  }
  const workflowId=randomUUID();await db.query("INSERT INTO smart_workflows(workflow_id,name,version,consumer_id,definition,state,actor_id,reason,scope_program_id) VALUES($1,$2,1,$3,$4,'active',$5,$6,$7)",[workflowId,'Scoped '+workflowId,sourceId,{steps:bindings.map(bindingId=>({bindingId,operation:'reserve'}))},adminId,reason,sourceProgram]);
  const command=target=>({protocol:'steward-module-integration-v1',commandId:randomUUID(),sourceModuleId:sourceId,targetModuleId:'steward.capability',command:'reserve',version:1,aggregateId:randomUUID(),sequence:1,occurredAt:new Date().toISOString(),payload:{sku:'SYN-1',quantity:1,orderId:randomUUID(),sourceProgramId:sourceProgram,programId:target},capability:{capabilityId:requirement.capabilityId,operation:'reserve'}});
  const verified=[];
  for(let n=0;n<2;n++){const c=command(destinations[n]),r=await routeSmartCommand(db,c,manifests[sourceId].m,trust,installationId,undefined,async(...args)=>verified.push(args));assert.equal(r.command.targetModuleId,providers[n]);assert.equal(r.scope.destinationProgramId,destinations[n]);if(n===0)await assert.rejects(routeSmartCommand(db,{...c,commandId:randomUUID(),sequence:2,payload:{...c.payload,programId:destinations[1]}},manifests[sourceId].m,trust,installationId,undefined,async()=>{}),/WORKFLOW_APPROVAL_REQUIRED/);}
  assert.equal((await db.query("SELECT count(*)::int n FROM smart_bindings WHERE consumer_id=$1 AND state='approved'",[sourceId])).rows[0].n,2);assert.equal(verified.length,4);
  const duplicate=(await db.query('SELECT * FROM smart_bindings WHERE binding_id=$1',[bindings[0]])).rows[0];await assert.rejects(db.query("INSERT INTO smart_bindings SELECT $1,consumer_id,capability_id,provider_id,provider_installation_id,package_digest,requirement,capability,actor_id,entity_id,state,revision,reason,created_at,updated_at,peer_installation_id,peer_grant_id,source_program_id,destination_program_id,purpose,expires_at FROM smart_bindings WHERE binding_id=$2",[randomUUID(),duplicate.binding_id]),e=>e.code==='23505');
 });
 if(browserMode)await test('browser performs discovery, explicit provider approval, retained-state reload and unavailable-state inspection',async()=>{
   const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});
   try{
     const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
     await page.goto(origin);await page.getByLabel('Username',{exact:true}).fill('local-admin');await page.getByLabel('Password',{exact:true}).fill(adminPassword);await page.getByRole('button',{name:'Sign in',exact:true}).click();
     await page.goto(origin+'/#/developer/diagnostics');await page.getByRole('heading',{name:'Smart Modules',exact:true}).waitFor();await page.getByText('example.stock-a 1.0.0',{exact:false}).waitFor();
     await page.getByLabel('Consumer module',{exact:true}).selectOption('example.checkout');await page.getByLabel('Required capability',{exact:true}).selectOption(requirement.capabilityId);
     await page.getByLabel('Smart Module approval reason').fill(reason);await page.getByRole('button',{name:'Inspect compatibility',exact:true}).click();await page.getByText('Resolution: ambiguous.',{exact:false}).waitFor();
     const [approval]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/v8/smart-modules/bindings')&&r.request().method()==='POST'),page.getByRole('button',{name:'Approve example.stock-b',exact:true}).click()]);assert.equal(approval.status(),200);await page.getByRole('button',{name:'Approve example.stock-b',exact:true}).waitFor();
     assert.equal((await db.query("SELECT count(*)::int n FROM smart_bindings WHERE state='approved' AND provider_id='example.stock-b'")).rows[0].n,1);
     await page.reload();await page.getByRole('heading',{name:'Smart Modules',exact:true}).waitFor();await page.getByText('example.stock-b 1.0.0',{exact:false}).waitFor();
     assert.equal((await db.query("SELECT count(*)::int n FROM smart_bindings WHERE state='approved' AND provider_id='example.stock-b'")).rows[0].n,1);
     unavailable.add('example.stock-b');await page.getByRole('button',{name:'Refresh capabilities',exact:true}).click();await page.getByText('example.stock-b 1.0.0 · unavailable',{exact:false}).waitFor();unavailable.clear();
     await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/phase8-smart-browser.png',fullPage:true});assert.deepEqual(errors,[]);
   }finally{await browser.close();}
 });
 console.log('PASS isolated SSMA PostgreSQL governance, real authentication, module inboxes and recovery. No commercial connector was exercised.');
}finally{for(const app of apps.reverse())await app.close();for(const pool of pools.reverse())await pool.end();try{docker(['rm','-f',container]);}catch{}await rm(secretFile,{force:true});if(browserMode)for(const f of ['tls-key.pem','tls-cert.pem','openssl.cnf'])await rm(dir+'/'+f,{force:true});await mkdir('artifacts',{recursive:true});report.finishedAt=new Date().toISOString();report.status=report.checks.length>0&&report.checks.every(c=>c.status==='passed')?'passed':'failed';await writeFile('artifacts/phase8-smart-'+(browserMode?'browser':'backend')+'-verification.json',JSON.stringify(report,null,2)+'\n');await rmdir(lock);}
