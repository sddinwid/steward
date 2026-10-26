// Real isolated PostgreSQL + HTTP injection; no retained deployment is mounted.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile,unlink,rmdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import pg from 'pg';
import {digest,validateManifest,INTEGRATION_PROTOCOL,captureSql} from '@steward/module-sdk';
import {boundReplicationEvents} from '../../module-host/dist/replication.js';
import {createBusinessServer,businessSql,ensure,save,publicRecord,BusinessError} from '../dist/index.js';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const {privateDirectory}=await import(pathToFileURL(path.join(root,'tools/installer/dist/security.js')).href);

await test('opt-in relationship policies protect reads, retries and committed access audit',async t=>{
 const directory=path.join(root,'.steward/business-access-tests',randomUUID()),container='steward-access-tests-'+randomUUID();await mkdir(directory,{recursive:true,mode:0o700});privateDirectory(directory);
 const password=randomBytes(32).toString('hex'),secretFile=path.join(directory,'postgres.env');await writeFile(secretFile,'POSTGRES_PASSWORD='+password+'\n',{mode:0o600});
 const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();let pool,app,started=false;
 try{
  docker(['run','--rm','-d','--name',container,'--env-file',secretFile,'-p','127.0.0.1::5432','postgres:17.10-alpine']);started=true;
  const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort);
  pool=new pg.Pool({host:'127.0.0.1',port,user:'postgres',password,database:'postgres',max:5,connectionTimeoutMillis:1000});
  for(let n=0;;n++)try{await pool.query('SELECT 1');break;}catch(e){if(n>=30)throw e;await delay(300);}
  const migration=businessSql+`CREATE TABLE access_grants(actor text,program_id uuid,PRIMARY KEY(actor,program_id));
   CREATE TABLE access_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,event jsonb NOT NULL);
   CREATE TABLE record_grants(actor text,record_id uuid,PRIMARY KEY(actor,record_id));`;
  await pool.query(migration);
  const a=randomUUID(),b=randomUUID(),actorA=randomUUID(),actorB=randomUUID(),token=randomBytes(32).toString('hex');
  const entityId=randomUUID(),installationId=randomUUID(),configuredImposter=randomUUID();
  await pool.query('INSERT INTO access_grants VALUES($1,$2),($3,$4)',[actorA,a,actorB,b]);
  const allowed=async(c,program)=>!!(await c.db.query('SELECT 1 FROM access_grants WHERE actor=$1 AND program_id=$2',[c.actor,program])).rowCount;
  const op=(operationId,method,path,permission='test.records.manage')=>({operationId,method,path,permission,...(method==='GET'?{query:['limit','offset','q','fields','status']}: {})});
  const manifest={manifestVersion:1,sdkVersion:1,moduleId:'test.records',version:'1.0.0',name:'Synthetic access fixture',description:'Disposable relationship authorization verification',minimumPlatformVersion:'0.12.0',dependencies:[],requiredPermissions:['storage.own-database'],configurationSchema:{type:'object',additionalProperties:false,properties:{}},persistence:{isolation:'dedicated-database',schemaVersion:1,migrations:[{version:1,sha256:digest(migration)}],destructiveRollback:false},integrationEvents:[],analyticalCapabilities:[],ui:[],api:[op('list','GET','/records'),op('create','POST','/records'),op('update','PUT','/records/:id'),op('approve','POST','/approve/:id'),op('abort','POST','/abort/:id'),op('report','GET','/reports'),op('query','GET','/private-query')]};
  manifest.integration={version:1,outboxPath:'/integration-outbox',inboxPath:'/integration-inbox',acknowledgmentPath:'/integration-ack',peers:[{moduleId:'test.sender',minimumVersion:'1.0.0',sends:[],receives:[{command:'grant.test',version:1}]}]};
  validateManifest(manifest);
  const resource={kind:'record',path:'/records',key:'code',schema:{type:'object',additionalProperties:false,required:['code','programId','privateNote'],properties:{code:{type:'string'},programId:{type:'string',pattern:'^[a-f0-9-]{36}$'},privateNote:{type:'string'}}},
   deriveKey:(_ctx,input)=>input.programId+':'+input.code,
   authorize:async(c,access)=>{
    if(access.operation==='list')return;
    const program=access.record?.data.programId??access.input?.programId;ensure(program&&await allowed(c,program),'Private program grant required',403);
    if(access.record)ensure((await c.db.query('SELECT 1 FROM record_grants WHERE actor=$1 AND record_id=$2',[c.actor,access.record.id])).rowCount,'Case relationship required',403);
   },listScope:async c=>({ids:(await c.db.query(`SELECT b.id FROM business_records b JOIN access_grants p ON p.program_id=(b.data->>'programId')::uuid AND p.actor=$1 JOIN record_grants r ON r.record_id=b.id AND r.actor=$1 WHERE b.kind='record'`,[c.actor])).rows.map(r=>r.id)}),
   after:async(r,previous,c)=>{if(!previous)await c.db.query('INSERT INTO record_grants VALUES($1,$2)',[c.actor,r.id]);}
  };
  let auditFailure=false;
  const definition={manifest,resources:[resource],
   authorize:async(c,access)=>{assert.equal(c.entityId,entityId);assert.notEqual(c.entityId,c.config.entityId);if(['query','report'].includes(access.operation))ensure((await c.db.query('SELECT 1 FROM access_grants WHERE actor=$1',[c.actor])).rowCount,'Program access required',403);},
   auditAccess:async(event,db)=>{if(auditFailure)throw Error('Unavailable');await db.query('INSERT INTO access_audit(event) VALUES($1)',[event]);},
   actions:[{kind:'record',path:'/approve/:id',permission:'test.records.manage',run:async(r,c)=>({record:publicRecord(await save(c,r.kind,r.key,{...r.data,status:'approved'},r))})},{kind:'record',path:'/abort/:id',permission:'test.records.manage',run:async(r,c)=>{await save(c,r.kind,r.key,{...r.data,privateNote:'UNCOMMITTED PRIVATE VALUE'},r);throw new BusinessError(409,'Transition unavailable');}}],
   receive:async(_command,c)=>({entityId:c.entityId}),report:async c=>({records:[],summary:'Authorized report',entityId:c.entityId}),queries:[{path:'/private-query',run:async()=>({records:[],summary:'Authorized query'})}]
  };
  app=createBusinessServer(pool,token,{configuration:{entityId:configuredImposter,integrationsEnabled:true},entityId,installationId},definition,async()=>1,async()=>{});
  const request=async(actor,method,url,body,status=200,extraHeaders={})=>{const response=await app.inject({method,url,headers:{authorization:'Bearer '+token,'x-steward-actor':actor,'x-steward-permissions':JSON.stringify(['test.records.manage']),...extraHeaders},...(body===undefined?{}:{payload:body})});assert.equal(response.statusCode,status,method+' '+url+' '+response.body);return response.json();};
  let rowA,rowB,rowC,createInput,actionInput;
  await t.test('relationship scope filters before pagination/search/field selection',async()=>{
   createInput={code:'A-PRIVATE',programId:a,privateNote:'SYNTHETIC PRIVATE CASE NOTE'};rowA=(await request(actorA,'POST','/records',createInput,201)).record;
   rowC=(await request(actorA,'POST','/records',{code:'A-SECOND',programId:a,privateNote:'SYNTHETIC SECOND NOTE'},201)).record;
   rowB=(await request(actorB,'POST','/records',{code:'Z-OWN',programId:b,privateNote:'SYNTHETIC OWN NOTE'},201)).record;
   const page=await request(actorB,'GET','/records?limit=1&offset=0');assert.equal(page.records.length,1);assert.equal(page.records[0].id,rowB.id);assert.equal(page.nextOffset,null);
   assert.deepEqual((await request(actorB,'GET','/records?q=A-PRIVATE&fields=id,privateNote')).records,[]);
   await pool.query('DELETE FROM record_grants WHERE actor=$1 AND record_id=$2',[actorA,rowC.id]);assert.deepEqual((await request(actorA,'GET','/records')).records.map(r=>r.id),[rowA.id]);
  });
  await t.test('missing and forbidden records have identical errors without revision enumeration',async()=>{
   const input={code:rowA.code,programId:b,privateNote:'SYNTHETIC ATTEMPT',revision:999};
   const forbidden=await request(actorB,'PUT','/records/'+rowA.id,input,404),missing=await request(actorB,'PUT','/records/'+randomUUID(),input,404);assert.deepEqual(forbidden,missing);assert(!JSON.stringify(forbidden).includes('PRIVATE CASE NOTE'));
  });
  await t.test('program-qualified natural keys do not expose another program creation collision',async()=>{
   const input={code:rowA.code,programId:b,privateNote:'SYNTHETIC OWN PROGRAM COPY'},copy=(await request(actorB,'POST','/records',input,201)).record;assert.notEqual(copy.id,rowA.id);assert.equal(copy.privateNote,input.privateNote);assert.equal((await request(actorB,'POST','/records',input,201)).record.id,copy.id);
   const updated=(await request(actorB,'PUT','/records/'+copy.id,{...input,revision:copy.revision,privateNote:'SYNTHETIC OWN UPDATE'})).record;assert.equal(updated.id,copy.id);await request(actorB,'PUT','/records/'+copy.id,{...input,programId:a,revision:updated.revision},409);
  });
  await t.test('request and integration contexts use trusted runtime entity rather than settings or headers',async()=>{
   assert.equal((await request(actorA,'GET','/reports',undefined,200,{'x-steward-entity':configuredImposter})).entityId,entityId);
   const command={protocol:INTEGRATION_PROTOCOL,commandId:randomUUID(),sourceModuleId:'test.sender',targetModuleId:'test.records',command:'grant.test',version:1,aggregateId:randomUUID(),sequence:1,occurredAt:new Date().toISOString(),payload:{}};
   const result=await request(actorA,'POST','/integration-inbox',command,200,{'x-steward-integration-source':'test.sender','x-steward-installation':installationId,'x-steward-entity':configuredImposter});assert.equal(result.entityId,entityId);
  });
  await t.test('current program and case relationships are rechecked for cached action/create receipts',async()=>{
   actionInput={revision:rowA.revision,requestId:randomUUID()};const first=await request(actorA,'POST','/approve/'+rowA.id,actionInput);assert.deepEqual(await request(actorA,'POST','/approve/'+rowA.id,actionInput),first);rowA=first.record;
   await pool.query('DELETE FROM record_grants WHERE actor=$1 AND record_id=$2',[actorA,rowA.id]);await request(actorA,'POST','/approve/'+rowA.id,actionInput,404);await request(actorA,'POST','/records',createInput,404);
   await pool.query('INSERT INTO record_grants VALUES($1,$2)',[actorA,rowA.id]);await pool.query('DELETE FROM access_grants WHERE actor=$1',[actorA]);await request(actorA,'POST','/approve/'+rowA.id,actionInput,404);await request(actorA,'POST','/records',createInput,403);await request(actorA,'GET','/reports',undefined,403);await request(actorA,'GET','/private-query',undefined,403);
   await pool.query('INSERT INTO access_grants VALUES($1,$2)',[actorA,a]);
  });
  await t.test('denied audit survives operation rollback and does not contain record content',async()=>{
   const before=(await pool.query('SELECT data FROM business_records WHERE id=$1',[rowA.id])).rows[0].data;
   await request(actorA,'POST','/abort/'+rowA.id,{revision:rowA.revision,requestId:randomUUID()},409);
   assert.deepEqual((await pool.query('SELECT data FROM business_records WHERE id=$1',[rowA.id])).rows[0].data,before);
   const entries=(await pool.query('SELECT event FROM access_audit ORDER BY id')).rows.map(r=>r.event);assert(entries.some(e=>e.path==='/records'&&e.method==='GET'&&e.allowed));assert(entries.some(e=>e.path==='/abort/:id'&&!e.allowed&&e.statusCode===409));assert(entries.some(e=>e.recordId===rowA.id&&e.statusCode===404));
   assert(entries.some(e=>e.actor===actorB&&e.path==='/records'&&e.allowed&&e.recordIds?.length===1&&e.recordIds[0]===rowB.id));assert(!entries.some(e=>e.actor===actorB&&e.recordIds?.includes(rowA.id)));
   const text=JSON.stringify(entries);assert(!text.includes('SYNTHETIC'));assert(!text.includes('UNCOMMITTED'));assert(!text.includes('privateNote'));assert(entries.every(e=>!Object.hasOwn(e,'query')&&!Object.hasOwn(e,'input')));
  });
  await t.test('audit failure withholds an otherwise authorized private response',async()=>{auditFailure=true;const result=await request(actorA,'GET','/records',undefined,503);assert.deepEqual(result,{error:'Module access audit unavailable'});auditFailure=false;});
  await t.test('post-commit audit failure is explicit and original mutation identity safely reconciles',async()=>{
   await pool.query('INSERT INTO record_grants VALUES($1,$2)',[actorA,rowC.id]);const input={revision:rowC.revision,requestId:randomUUID()};auditFailure=true;const failed=await request(actorA,'POST','/approve/'+rowC.id,input,503);assert.equal(failed.recovery,'OUTCOME_REQUIRES_RECONCILIATION');assert(failed.error.includes('may have committed'));auditFailure=false;
   assert.equal((await pool.query('SELECT data FROM business_records WHERE id=$1',[rowC.id])).rows[0].data.status,'approved');const revision=(await request(actorA,'POST','/approve/'+rowC.id,input)).record.revision;assert.equal(revision,rowC.revision+1);assert.equal((await pool.query("SELECT count(*)::int n FROM business_audit WHERE record_id=$1 AND operation='/approve/:id'",[rowC.id])).rows[0].n,1);
  });
  await t.test('forged actor on an unauthenticated gateway request is not trusted in audit',async()=>{await request(actorA,'GET','/records',undefined,401,{authorization:'Bearer invalid'});const event=(await pool.query('SELECT event FROM access_audit ORDER BY id DESC LIMIT 1')).rows[0].event;assert.equal(event.actor,null);assert.equal(event.allowed,false);});
  await t.test('actual SDK capture SQL preserves declared legacy wire fields and host rejects a relabeled database envelope',async()=>{
   const projected={...manifest,replication:{contractVersion:1,streams:[{streamId:'approved_summary',table:'published_summary',idColumn:'id',revisionColumn:'revision',columns:['id','revision','projection']}]}};validateManifest(projected);
   await pool.query('CREATE TABLE published_summary(id uuid PRIMARY KEY,revision integer NOT NULL,projection jsonb NOT NULL,private_note text)');await pool.query(captureSql(projected,{installationId,role:'worker',entity:{entityId,displayName:'Synthetic operator'}},randomUUID()));
   await pool.query('INSERT INTO published_summary VALUES($1,1,$2,$3)',[randomUUID(),{approved:true,count:10},'SYNTHETIC PRIVATE NOTE NOT PUBLISHED']);
   const events=(await pool.query('SELECT envelope FROM sync_outbox')).rows.map(r=>r.envelope);assert.equal(events.length,1);assert(!JSON.stringify(events).includes('PRIVATE NOTE'));assert.deepEqual(boundReplicationEvents(projected,events,installationId),events);
   await pool.query("UPDATE sync_outbox SET envelope=jsonb_set(envelope,'{moduleId}','\"unrelated.legacy\"')");const relabeled=(await pool.query('SELECT envelope FROM sync_outbox')).rows.map(r=>r.envelope);assert.throws(()=>boundReplicationEvents(projected,relabeled,installationId),/MODULE_REPLICATION_BINDING_MISMATCH/);
  });
  await t.test('legacy modules without policy keep existing cached receipt semantics',async()=>{
   const legacy=createBusinessServer(pool,token,{configuration:{},installationId:randomUUID()},{manifest,resources:[{...resource,authorize:undefined,listScope:undefined,deriveKey:undefined}],actions:definition.actions},async()=>1,async()=>{});
   try{await pool.query('DELETE FROM business_records WHERE id=$1',[rowA.id]);const response=await legacy.inject({method:'POST',url:'/approve/'+rowA.id,headers:{authorization:'Bearer '+token,'x-steward-actor':actorA,'x-steward-permissions':'["test.records.manage"]'},payload:actionInput});assert.equal(response.statusCode,200);assert.equal(response.json().record.id,rowA.id);}finally{await legacy.close();}
  });
 }finally{if(app)await app.close();if(pool)await pool.end();if(started)docker(['rm','-f',container]);await unlink(secretFile);await rmdir(directory);}
});
