// Real isolated PostgreSQL and authenticated module HTTP injection. No operator
// databases, credentials or containers are used. Private ACKs below are explicit
// host-attestation fixtures; this script does not prove installed SSMA routing.
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createBusinessServer} from '../packages/business-kit/dist/index.js';
import {canonical,digest,validateManifest,validateCommand,validateCapabilityValue} from '../packages/module-sdk/dist/index.js';
import {catalogOperations} from '../packages/catalog-kit/dist/index.js';
import {privateDirectory} from '../tools/installer/dist/security.js';
import {catalog} from '../modules/catalog/dist/definition.js';
import {externalObservationSchema} from '../modules/catalog/dist/source-contract.js';

process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const directory='.steward/phase15-catalog-tests',container='steward-catalog-tests-'+randomUUID();
const secretFile=directory+'/'+randomUUID()+'.env',password=randomBytes(32).toString('base64url');
await mkdir(directory,{recursive:true});privateDirectory(directory);
await writeFile(secretFile,'POSTGRES_PASSWORD='+password+'\n',{mode:0o600});
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
let pool,app;
const entityId=randomUUID(),installationId=randomUUID(),actor=randomUUID(),token=randomBytes(32).toString('base64url');
const providerIdentity={workerInstallationId:installationId,entityId,moduleId:'steward.catalog.universal',moduleInstallationId:randomUUID(),packageDigest:'a'.repeat(64)};
try{
 docker(['run','--rm','-d','--name',container,'--env-file',secretFile,'-p','127.0.0.1::5432','postgres:17.10-alpine']);
 const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort);
 pool=new pg.Pool({host:'127.0.0.1',port,user:'postgres',password,database:'postgres',max:5,connectionTimeoutMillis:1000});
 for(let n=0;;n++){try{await pool.query('SELECT 1');break;}catch(e){if(n>=30)throw e;await delay(300);}}
 const manifest=JSON.parse(await readFile('modules/catalog/manifest.json','utf8'));
 const files=(await readdir('modules/catalog/migrations')).filter(f=>/^\d{3}-[a-z-]+\.sql$/.test(f)).sort();
 assert.equal(files.length,manifest.persistence.schemaVersion);
 for(const [n,file] of files.entries()){const sql=await readFile('modules/catalog/migrations/'+file,'utf8');assert.equal(digest(sql),manifest.persistence.migrations[n].sha256,'Signed migration digest '+file);await pool.query(sql);}
 validateManifest(manifest);
 const runtime={installationId,entityId,providerIdentity,configuration:{integrationsEnabled:true}},all=[...new Set(manifest.api.map(op=>op.permission))];
 const start=(override={})=>createBusinessServer(pool,token,{...runtime,...override},catalog(manifest),async()=>files.length,async()=>{});app=start();
 const inject=(method,url,payload,permissions=all,who=actor,headers={})=>app.inject({method,url,headers:{authorization:'Bearer '+token,'x-steward-actor':who,'x-steward-permissions':JSON.stringify(permissions),...headers},...(payload===undefined?{}:{payload})});
 const q=async(method,url,payload,status=200,permissions=all,who=actor,headers={})=>{const response=await inject(method,url,payload,permissions,who,headers);assert.equal(response.statusCode,status,method+' '+url+': '+response.body);return response.json();};
 const makeInput=(type,patch={})=>({recordKey:randomUUID(),code:'TEST-'+type.toUpperCase()+'-'+randomUUID().slice(0,8),name:'Synthetic '+type,description:'Disposable universal catalog acceptance fixture',type,status:'draft',...patch});
 const make=async(type,patch={})=>{const input=makeInput(type,patch);return{input,record:(await q('POST','/offerings',input,201)).record};};
 const update=(path,input,record,patch={},status=200)=>q('PUT',path+'/'+record.id,{...input,...patch,revision:record.revision},status);
 const action=(path,record,requestId=randomUUID(),status=200)=>q('POST',path+'/'+record.id,{revision:record.revision,requestId},status);
 const listing=async(path)=>{const rows=[];let offset=0;for(let page=0;page<100;page++){const result=await q('GET',path+(path.includes('?')?'&':'?')+'limit=20&offset='+offset);rows.push(...result.records);if(result.nextOffset===null||result.nextOffset===undefined)return rows;offset=result.nextOffset;}throw Error('Acceptance listing exceeded bounded pagination');};
 const current=async(path,id)=>{const record=(await listing(path)).find(r=>r.id===id);assert(record,'Expected persisted '+path+' record');return record;};
 const offerings=new Map();
 const sourcePin={providerModuleId:'fixture.catalog.source',providerInstallationId:randomUUID(),packageDigest:'b'.repeat(64)};
 const observation=(patch={})=>({contractVersion:1,sourceRecordId:'source-'+randomUUID(),sourceStreamId:'external_products',sourceRevision:1,externalProvider:'fixture-catalog',accountId:'synthetic-acceptance-store',productId:'remote-'+randomUUID(),externalVariantId:null,name:'Synthetic external product',code:'EXT-'+randomUUID().slice(0,8),type:'physical',observedAt:new Date().toISOString(),supportedCapabilities:[],...patch});
 const beginRead=async(source,kind='observation')=>{const input={recordKey:randomUUID(),kind,sourceRecordId:source.sourceRecordId,sourceStreamId:source.sourceStreamId},job=(await q('POST','/read-jobs',input,201)).record,requested=await action('/request-source',job),row=(await pool.query('SELECT envelope FROM integration_outbox WHERE command_id=$1',[requested.commandId])).rows[0];assert(row);assert.equal(row.envelope.command,kind==='observation'?'catalog.source.read':'catalog.definition.read');assert.equal(row.envelope.capability.capabilityId,kind==='observation'?'catalog.external-observations.read':'catalog.extension-definitions.read');return{job:requested.record,command:row.envelope,source};};
 const finishRead=async(read,source=read.source,pin=sourcePin,status=200)=>q('POST','/integration-ack',{commandId:read.command.commandId,digest:validateCommand(read.command),status:'delivered',result:{...source,...(pin?{_steward:pin}:{})}},status);
 const readObservation=async(source,pin=sourcePin)=>{validateCapabilityValue(source,externalObservationSchema);const read=await beginRead(source);await finishRead(read,source,pin);const saved=await current('/read-jobs',read.job.id);assert.equal(saved.status,'completed');return{...read,stored:(await listing('/external-observations')).find(r=>r.id===saved.observationId)};};

 await test('Catalog is independent of Pricing and declares dedicated append-only module persistence',()=>{
  assert.equal(manifest.moduleId,providerIdentity.moduleId);assert.equal(manifest.persistence.isolation,'dedicated-database');assert.equal(manifest.persistence.destructiveRollback,false);assert(!manifest.dependencies.some(d=>d.moduleId==='steward.pricing.management'));
  assert(manifest.smart.provides.some(c=>c.capabilityId==='catalog.offerings.read'));assert(manifest.api.every(op=>op.permission.startsWith(manifest.moduleId+'.')));
 });
 await test('All six offering types persist through the regular validated CRUD API',async()=>{
  for(const type of ['physical','digital','service','subscription','rental','bundle']){const created=await make(type);offerings.set(type,created);assert.equal(created.record.type,type);assert(created.record.id);assert.equal(created.record.revision,1);assert.equal((await current('/offerings',created.record.id)).name,created.input.name);}
  const allRows=await listing('/offerings');assert.equal(allRows.length,6);
 });
 await test('Creation retries preserve the original identity and reject conflicting or cross-actor replay',async()=>{
  const f=offerings.get('service'),before=await pool.query('SELECT count(*)::int n FROM business_records');const retry=await q('POST','/offerings',f.input,201);assert.equal(retry.record.id,f.record.id);assert.equal(retry.replayed,true);assert.equal((await pool.query('SELECT count(*)::int n FROM business_records')).rows[0].n,before.rows[0].n);
  await q('POST','/offerings',{...f.input,name:'Conflicting same creation identity'},409);await q('POST','/offerings',f.input,409,all,randomUUID());
 });
 await test('Offering edits use optimistic revisions and preserve both concurrent-edit outcomes',async()=>{
  const f=offerings.get('service'),a={...f.input,name:'First concurrent editor',revision:f.record.revision},b={...f.input,name:'Second concurrent editor',revision:f.record.revision};const responses=await Promise.all([inject('PUT','/offerings/'+f.record.id,a),inject('PUT','/offerings/'+f.record.id,b)]);assert.deepEqual(responses.map(r=>r.statusCode).sort(),[200,409]);f.record=await current('/offerings',f.record.id);f.input.name=f.record.name;assert.equal(f.record.revision,2);assert([a.name,b.name].includes(f.record.name));
  await q('PUT','/offerings/'+f.record.id,{...f.input,revision:1},409);
 });
 await test('Client owner, own-provider identity, audit identity and verification claims cannot grant authority',async()=>{
  for(const patch of [{ownerEntityId:randomUUID()},{providerIdentity:{...providerIdentity,moduleInstallationId:randomUUID()}},{createdBy:randomUUID()},{verified:true},{permissions:[manifest.moduleId+'.admin']}])await q('POST','/offerings',makeInput('service',patch),400);
  await q('POST','/offerings',makeInput('service'),403,all,'module-runtime');
  await q('GET','/offerings',undefined,403,[]);await q('POST','/offerings',makeInput('service'),403,[]);
 });
 await test('Search, field selection and pagination remain bounded and permissioned',async()=>{
  const f=offerings.get('physical');const found=await q('GET','/directory?q='+encodeURIComponent(f.input.code));assert(found.records.some(r=>r.id===f.record.id));const selected=await q('GET','/offerings?fields=code,name');assert(selected.records.length);assert.deepEqual(Object.keys(selected.records[0]).sort(),['code','name']);await q('GET','/offerings?limit=0',undefined,400);await q('GET','/offerings?fields=providerSecrets',undefined,400);
 });

 await test('Categories reject hierarchy cycles and offering variants retain parent identity and unique codes',async()=>{
  const categoryInput={recordKey:randomUUID(),name:'Synthetic products'},category=(await q('POST','/categories',categoryInput,201)).record,childInput={recordKey:randomUUID(),name:'Synthetic child',parentId:category.id},child=(await q('POST','/categories',childInput,201)).record;
  await update('/categories',categoryInput,category,{parentId:child.id},409);
  const f=offerings.get('physical');f.record=await current('/offerings',f.record.id);f.input.categoryIds=[category.id];f.record=(await update('/offerings',f.input,f.record)).record;
  const variantInput={recordKey:randomUUID(),offeringId:f.record.id,code:'SYN-BLUE',name:'Synthetic blue',status:'draft',unitOfMeasure:'item'},variant=(await q('POST','/variants',variantInput,201)).record;
  assert.equal(variant.offeringId,f.record.id);assert.equal(variant.unitOfMeasure,'item');assert.equal((await q('POST','/variants',variantInput,201)).record.id,variant.id);
  await q('POST','/variants',{...variantInput,recordKey:randomUUID()},409);
  await q('POST','/variants',{...variantInput,recordKey:randomUUID(),offeringId:offerings.get('service').record.id},422);
  const edited=(await update('/variants',variantInput,variant,{name:'Synthetic blue revised'})).record;assert.equal(edited.revision,2);await update('/variants',variantInput,variant,{name:'Stale variant edit'},409);
  await q('POST','/variants',{...variantInput,recordKey:randomUUID(),offeringId:randomUUID()},404);
 });

 await test('Typed offering and variant attributes enforce definitions, bounds and activation requirements',async()=>{
  const f=offerings.get('physical'),definitionInput={recordKey:randomUUID(),key:'material',name:'Material',type:'choice',required:true,scope:'offering',offeringTypes:['physical'],choices:['cotton','wool']},definition=(await q('POST','/attribute-definitions',definitionInput,201)).record;
  f.record=await current('/offerings',f.record.id);await update('/offerings',f.input,f.record,{status:'active'},422);
  const valueInput={recordKey:randomUUID(),offeringId:f.record.id,definitionId:definition.id,valueType:'choice',valueChoice:'cotton'};
  await q('POST','/attributes',{...valueInput,valueChoice:'plastic'},422);await q('POST','/attributes',{...valueInput,valueType:'boolean',valueBoolean:true},422);await q('POST','/attributes',{...valueInput,valueText:'cotton'},422);
  const value=(await q('POST','/attributes',valueInput,201)).record;assert.equal(value.valueChoice,'cotton');await q('POST','/attributes',{...valueInput,recordKey:randomUUID()},409);
  await update('/attribute-definitions',definitionInput,definition,{choices:['cotton']},409);
  const variant=(await listing('/variants')).find(v=>v.offeringId===f.record.id);assert(variant);
  const variantDefinition=(await q('POST','/attribute-definitions',{recordKey:randomUUID(),key:'color',name:'Color',type:'text',required:false,scope:'variant',offeringTypes:['physical'],maxLength:10},201)).record;
  await q('POST','/attributes',{recordKey:randomUUID(),offeringId:f.record.id,variantId:variant.id,definitionId:variantDefinition.id,valueType:'text',valueText:'Blue'},201);
  const view=(await q('GET','/catalog-view?q='+f.record.id)).records[0];assert(view.attributes.some(a=>a.key==='material'&&a.value==='cotton'));assert(view.variants.find(v=>v.id===variant.id).attributes.some(a=>a.key==='color'&&a.value==='Blue'));
  f.record=await current('/offerings',f.record.id);f.input.status='active';f.record=(await update('/offerings',f.input,f.record)).record;
 });

 await test('Attribute-definition conflicts roll back and new required scope cannot invalidate existing active offerings',async()=>{
  const definitions=await listing('/attribute-definitions'),material=definitions.find(d=>d.key==='material');assert(material);const before=definitions.length;
  await q('POST','/attribute-definitions',{recordKey:randomUUID(),key:'material',name:'Conflicting material',type:'text',required:false,scope:'offering',offeringTypes:['physical']},409);assert.equal((await listing('/attribute-definitions')).length,before);
  await q('POST','/attribute-definitions',{recordKey:randomUUID(),key:'new-required-finish',name:'New required finish',type:'text',required:true,scope:'offering',offeringTypes:['physical']},409);assert.equal((await listing('/attribute-definitions')).length,before);
  const physical=offerings.get('physical'),view=(await q('GET','/catalog-view?q='+physical.record.id)).records[0];assert.equal(view.status,'active');assert(view.attributes.some(a=>a.key==='material'&&a.value==='cotton'));assert(!view.attributes.some(a=>a.key==='new-required-finish'));
 });

 await test('Bundle components reject self references, graph cycles and duplicates while preserving component authority',async()=>{
  const a=offerings.get('bundle'),b=await make('bundle'),physical=offerings.get('physical'),digital=offerings.get('digital');
  const edgeInput={recordKey:randomUUID(),offeringId:a.record.id,componentOfferingId:b.record.id,quantity:1,unitOfMeasure:'offering',required:true},edge=(await q('POST','/bundle-components',edgeInput,201)).record;
  await q('POST','/bundle-components',{...edgeInput,recordKey:randomUUID(),offeringId:b.record.id,componentOfferingId:a.record.id},409);await q('POST','/bundle-components',{...edgeInput,recordKey:randomUUID(),componentOfferingId:a.record.id},409);
  await update('/bundle-components',edgeInput,edge,{componentOfferingId:physical.record.id});
  const otherEdge={recordKey:randomUUID(),offeringId:a.record.id,componentOfferingId:digital.record.id,quantity:1,unitOfMeasure:'license',required:true};await q('POST','/bundle-components',otherEdge,201);await q('POST','/bundle-components',{...otherEdge,recordKey:randomUUID()},409);
  a.record=await current('/offerings',a.record.id);await update('/offerings',a.input,a.record,{status:'active'},409);
  digital.record=await current('/offerings',digital.record.id);digital.input.status='active';digital.record=(await update('/offerings',digital.input,digital.record)).record;
  a.record=await current('/offerings',a.record.id);a.input.status='active';a.record=(await update('/offerings',a.input,a.record)).record;
  physical.record=await current('/offerings',physical.record.id);await update('/offerings',physical.input,physical.record,{status:'inactive'},409);await action('/archive',physical.record,randomUUID(),409);
  const view=(await q('GET','/catalog-view?q='+a.record.id)).records[0];assert.equal(view.bundle.components.length,2);assert(view.bundle.components.some(c=>c.offeringId===physical.record.id));assert.equal(Object.hasOwn(view,'stockBalance'),false);assert.equal(Object.hasOwn(view,'priceCents'),false);
 });

 await test('Active bundle edits cannot introduce inactive components and archived parent children stay immutable',async()=>{
  const a=offerings.get('bundle'),edge=(await listing('/bundle-components')).find(e=>e.offeringId===a.record.id),inactive=await make('digital',{status:'inactive'});assert(edge);const before=(await q('GET','/catalog-view?q='+a.record.id)).records[0],input={recordKey:edge.recordKey,offeringId:edge.offeringId,componentOfferingId:edge.componentOfferingId,quantity:edge.quantity,unitOfMeasure:edge.unitOfMeasure,required:edge.required};
  const failed=await inject('PUT','/bundle-components/'+edge.id,{...input,revision:edge.revision,componentOfferingId:inactive.record.id});assert(failed.statusCode>=400&&failed.statusCode<500,failed.body);assert.deepEqual((await q('GET','/catalog-view?q='+a.record.id)).records[0],before);
  const physical=offerings.get('physical'),physicalEdge=(await listing('/bundle-components')).find(e=>e.offeringId===a.record.id&&e.componentOfferingId===physical.record.id),draftVariant=(await listing('/variants')).find(v=>v.offeringId===physical.record.id);assert(physicalEdge&&draftVariant);const badVariant=await inject('PUT','/bundle-components/'+physicalEdge.id,{recordKey:physicalEdge.recordKey,offeringId:physicalEdge.offeringId,componentOfferingId:physicalEdge.componentOfferingId,componentVariantId:draftVariant.id,quantity:physicalEdge.quantity,unitOfMeasure:physicalEdge.unitOfMeasure,required:physicalEdge.required,revision:physicalEdge.revision});assert.equal(badVariant.statusCode,409,badVariant.body);assert.deepEqual((await q('GET','/catalog-view?q='+a.record.id)).records[0],before);
  const parent=await make('digital'),childInput={recordKey:randomUUID(),offeringId:parent.record.id,code:'ARCHIVE-CHILD',name:'Archived parent variant',status:'draft',unitOfMeasure:'license'},child=(await q('POST','/variants',childInput,201)).record;parent.record=await current('/offerings',parent.record.id);const archived=(await action('/archive',parent.record)).record;assert.equal(archived.status,'archived');await update('/variants',childInput,child,{name:'Forbidden child edit'},409);await q('POST','/variants',{...childInput,recordKey:randomUUID(),code:'NEW-CHILD'},409);assert.equal((await current('/variants',child.id)).name,childInput.name);
 });

 await test('Archiving is audited, idempotent per request and leaves immutable offering history',async()=>{
  const f=offerings.get('service');f.record=await current('/offerings',f.record.id);const requestId=randomUUID(),archived=await action('/archive',f.record,requestId);assert.equal(archived.record.status,'archived');assert.deepEqual(await action('/archive',f.record,requestId),archived);f.record=archived.record;
  await update('/offerings',f.input,f.record,{name:'Illegal archived edit'},409);await action('/archive',f.record,randomUUID(),409);
  const rows=(await q('GET','/history?q='+f.record.id)).records;assert.equal(rows.length,3);assert.deepEqual(rows.map(r=>r.revision).sort((a,b)=>a-b),[1,2,3]);const first=rows.find(r=>r.revision===1),last=rows.find(r=>r.revision===3);assert.equal(first.snapshot.name,'Synthetic service');assert.equal(last.snapshot.status,'archived');assert(rows.every(r=>r.actor===actor));
  await assert.rejects(pool.query("UPDATE catalog_history SET operation='rewritten' WHERE offering_id=$1",[f.record.id]));assert.deepEqual((await q('GET','/history?q='+f.record.id)).records,rows);
 });

 await test('A foreign entity runtime cannot read or modify original catalog records',async()=>{
  const own=app,foreignEntity=randomUUID();app=start({entityId:foreignEntity,providerIdentity:{...providerIdentity,entityId:foreignEntity,moduleInstallationId:randomUUID()}});
  try{await q('GET','/offerings',undefined,403);const f=offerings.get('service');await update('/offerings',f.input,f.record,{name:'Foreign edit'},404);await q('GET','/catalog-view?q='+f.record.id,undefined,404);}finally{await app.close();app=own;}
 });

 await test('Catalog reads use declared durable SSMA contracts without a Pricing provider',async()=>{
  const f=offerings.get('physical'),operation=catalogOperations.find(o=>o.name==='catalog.lookup');assert(operation);const command={protocol:'steward-module-integration-v1',commandId:randomUUID(),sourceModuleId:'test.catalog.consumer',targetModuleId:manifest.moduleId,command:operation.name,version:1,aggregateId:randomUUID(),sequence:1,occurredAt:new Date().toISOString(),payload:{contractVersion:1,offeringId:f.record.id,variantId:null},capability:{capabilityId:'catalog.offerings.read',operation:operation.name}};
  const headers={'x-steward-installation':installationId,'x-steward-integration-source':command.sourceModuleId,'x-steward-capability':'catalog.offerings.read'};const result=await q('POST','/integration-inbox',command,200,[],actor,headers);validateCapabilityValue(result,operation.output);assert.equal(result.offering.id,f.record.id);assert.equal(result.offering.ownerEntityId,entityId);assert.deepEqual(await q('POST','/integration-inbox',command,200,[],actor,headers),result);
  await q('POST','/integration-inbox',{...command,commandId:randomUUID(),aggregateId:randomUUID(),payload:{...command.payload,ownerEntityId:entityId}},422,[],actor,headers);
 });

 await test('Source observations require an actual queued read receipt and private well-formed host attestation',async()=>{
  const source=observation(),read=await beginRead(source);await finishRead(read,source,null,403);await finishRead(read,source,{...sourcePin,providerInstallationId:'forged'},403);await finishRead(read,source,{...sourcePin,packageDigest:'forged'},403);await finishRead(read,{...source,sourceStreamId:'wrong_declared_stream'},sourcePin,409);
  await finishRead(read,source,{...sourcePin,destinationEntityId:randomUUID(),destinationInstallationId:installationId},403);await finishRead(read,source,{...sourcePin,destinationEntityId:entityId,destinationInstallationId:randomUUID()},403);
  assert.equal((await current('/read-jobs',read.job.id)).status,'pending');assert.equal((await listing('/external-observations')).length,0);
  await finishRead(read);const saved=await current('/read-jobs',read.job.id),stored=(await listing('/external-observations')).find(r=>r.id===saved.observationId);assert(stored);assert.equal(stored.source.provider.moduleInstallationId,sourcePin.providerInstallationId);assert.equal(stored.source.provider.packageDigest,sourcePin.packageDigest);assert.equal(stored.source.streamId,source.sourceStreamId);assert.equal(stored.source.recordId,source.sourceRecordId);
  await finishRead(read);assert.equal((await listing('/external-observations')).length,1);
  await q('POST','/mappings',{recordKey:randomUUID(),offeringId:offerings.get('physical').record.id,observationId:randomUUID(),status:'verified'},404);await q('POST','/read-jobs',{recordKey:randomUUID(),sourceRecordId:'forged',sourceStreamId:'external_products',verified:true,provider:providerIdentity},400);
  const invalidReplay=await inject('POST','/integration-ack',{commandId:read.command.commandId,digest:'c'.repeat(64),status:'delivered',result:{...source,_steward:sourcePin}});assert.equal(invalidReplay.statusCode,409);
 });

 await test('Read freshness, future timestamps and source revisions fail closed without replacing verified evidence',async()=>{
  for(const observedAt of [new Date(Date.now()-48*3600000).toISOString(),new Date(Date.now()+3600000).toISOString()]){const source=observation({observedAt}),read=await beginRead(source),before=(await listing('/external-observations')).length;const failed=await inject('POST','/integration-ack',{commandId:read.command.commandId,digest:validateCommand(read.command),status:'delivered',result:{...source,_steward:sourcePin}});assert(failed.statusCode>=400&&failed.statusCode<500,failed.body);assert.equal((await listing('/external-observations')).length,before);assert.equal((await current('/read-jobs',read.job.id)).status,'pending');}
  const source=observation({sourceRevision:2}),read=await readObservation(source);assert(read.stored);for(const changed of [{...source,sourceRevision:1},{...source,name:'Changed facts at the same source revision'}]){const next=await beginRead(changed);const failed=await inject('POST','/integration-ack',{commandId:next.command.commandId,digest:validateCommand(next.command),status:'delivered',result:{...changed,_steward:sourcePin}});assert.equal(failed.statusCode,409,failed.body);assert.deepEqual((await listing('/external-observations')).find(r=>r.id===read.stored.id),read.stored);}
  const job=(await q('POST','/read-jobs',{recordKey:randomUUID(),sourceRecordId:'disabled',sourceStreamId:'external_products'},201)).record,own=app;app=start({configuration:{integrationsEnabled:false}});try{await action('/request-source',job,randomUUID(),409);}finally{await app.close();app=own;}
 });

 await test('Verified external mappings preserve provider ownership and reject global collisions and forged fields',async()=>{
  const read=await readObservation(observation()),physical=offerings.get('physical'),other=await make('physical'),input={recordKey:randomUUID(),offeringId:physical.record.id,observationId:read.stored.id,status:'verified',displayNameOverride:'Local display label'},mapping=(await q('POST','/mappings',input,201)).record;
  assert.equal(mapping.mapping.provider.moduleInstallationId,sourcePin.providerInstallationId);assert.equal(mapping.mapping.source.streamId,read.source.sourceStreamId);assert.equal(mapping.mapping.productId,read.source.productId);assert.equal(mapping.mapping.accountId,read.source.accountId);assert(!mapping.mapping.fieldAuthority.some(f=>['pricing','fulfillment'].includes(f.field)),'Read observations do not establish pricing or fulfillment authority');
  assert.equal((await q('POST','/mappings',input,201)).record.id,mapping.id);await q('POST','/mappings',{...input,recordKey:randomUUID(),offeringId:other.record.id},409);
  for(const patch of [{provider:{...providerIdentity}},{verified:true},{lastVerifiedAt:new Date().toISOString()},{fieldAuthority:[{field:'pricing',authority:'steward'}]}])await q('POST','/mappings',{...input,recordKey:randomUUID(),...patch},400);
  const view=(await q('GET','/catalog-view?q='+physical.record.id)).records[0];assert.equal(view.externalMappings[0].provider.moduleInstallationId,sourcePin.providerInstallationId);assert.equal(view.externalMappings[0].fieldAuthority.find(f=>f.field==='name').localOverride,input.displayNameOverride);
 });

 await test('Import previews never merge by SKU/name and explicit draft import is idempotent per approved request',async()=>{
  const physical=offerings.get('physical'),source=observation({code:physical.input.code,name:physical.input.name}),read=await readObservation(source),before=(await listing('/offerings')).length;
  const preview=await q('POST','/preview-import',{observationId:read.stored.id});assert.equal(preview.mutationPerformed,false);assert(preview.records[0].possibleDuplicateOfferingIds.includes(physical.record.id));assert.equal((await listing('/offerings')).length,before);
  const planInput={recordKey:randomUUID(),observationId:read.stored.id,newCode:source.code,newName:source.name},plan=(await q('POST','/import-plans',planInput,201)).record;assert.equal((await q('POST','/import-plans',planInput,201)).record.id,plan.id);
  const requestId=randomUUID(),result=await action('/apply-import',plan,requestId);assert.deepEqual(await action('/apply-import',plan,requestId),result);assert.notEqual(result.offeringId,physical.record.id);assert.equal((await listing('/offerings')).length,before+1);const imported=await current('/offerings',result.offeringId);assert.equal(imported.status,'draft');assert.equal(imported.code,physical.input.code);assert.equal((await current('/mappings',result.mappingId)).mapping.origin,'import');
  await q('POST','/import-plans',{...planInput,newName:'Different retry terms'},409);await action('/apply-import',result.record,randomUUID(),409);
  assert.match(imported.recordKey,/^[a-f0-9-]{36}$/i);const edited=(await update('/offerings',{recordKey:imported.recordKey,code:imported.code,name:imported.name,description:imported.description,type:imported.type,status:imported.status},imported,{name:'Explicitly edited imported draft'})).record;assert.equal(edited.name,'Explicitly edited imported draft');const filtered=await q('GET','/directory?q='+encodeURIComponent(edited.name)+'&status=draft');assert.equal(filtered.records.length,1);assert.equal(filtered.records[0].duplicateCode,true,'Hidden active same-code twin still produces a duplicate warning');
 });

 await test('Import apply rejects changed or stale source evidence without creating replacement offerings',async()=>{
  const read=await readObservation(observation()),plan=(await q('POST','/import-plans',{recordKey:randomUUID(),observationId:read.stored.id,newCode:'UNCHANGED-SOURCE',newName:'Original planned import'},201)).record,before=(await listing('/offerings')).length;
  const refreshed={...read.source,sourceRevision:2,name:'Updated source name'};await readObservation(refreshed);await action('/apply-import',plan,randomUUID(),409);assert.equal((await listing('/offerings')).length,before);
  const fresh=await readObservation(observation({observedAt:new Date(Date.now()-2*3600000).toISOString()})),stalePlan=(await q('POST','/import-plans',{recordKey:randomUUID(),observationId:fresh.stored.id,newCode:'STALE-SOURCE',newName:'Stale planned import'},201)).record;
  // Tighten only this disposable module's freshness policy. The retained source
  // payload/digest stays unchanged, so rejection proves a fresh policy check.
  const own=app;app=start({configuration:{integrationsEnabled:true,sourceMaxAgeHours:1}});try{await action('/apply-import',stalePlan,randomUUID(),409);await q('POST','/mappings',{recordKey:randomUUID(),offeringId:offerings.get('physical').record.id,observationId:fresh.stored.id,status:'verified'},409);}finally{await app.close();app=own;}assert.equal((await listing('/offerings')).length,before);assert.deepEqual((await listing('/external-observations')).find(r=>r.id===fresh.stored.id),fresh.stored);
 });

 await test('Source resolution remains stream-qualified and repeated identities report mapping conflicts',async()=>{
  const source=observation(),one=await readObservation(source),two=await readObservation({...source,sourceStreamId:'another_declared_stream'});assert.notEqual(one.stored.id,two.stored.id);assert.equal(one.stored.source.recordId,two.stored.source.recordId);assert.notEqual(one.stored.source.streamId,two.stored.source.streamId);
  const physical=offerings.get('physical');await q('POST','/mappings',{recordKey:randomUUID(),offeringId:physical.record.id,observationId:one.stored.id,status:'verified'},201);const preview=await q('POST','/preview-import',{observationId:two.stored.id});assert.equal(preview.records[0].status,'conflict');assert(preview.records[0].mappedOfferingIds.includes(physical.record.id));await q('POST','/mappings',{recordKey:randomUUID(),offeringId:physical.record.id,observationId:two.stored.id,status:'verified'},409);
 });

 await test('Provider upgrade or reinstall preserves old source pins and reports external identity continuity conflicts',async()=>{
  const source=observation(),first=await readObservation(source),physical=offerings.get('physical'),other=await make('physical'),input={recordKey:randomUUID(),offeringId:physical.record.id,observationId:first.stored.id,status:'verified'},mapping=(await q('POST','/mappings',input,201)).record;
  for(const pin of [{...sourcePin,packageDigest:'c'.repeat(64)},{...sourcePin,providerInstallationId:randomUUID()}]){const refreshed=await readObservation(source,pin);assert.notEqual(refreshed.stored.id,first.stored.id);assert.equal(refreshed.stored.provider.packageDigest,pin.packageDigest);const preview=await q('POST','/preview-import',{observationId:refreshed.stored.id});assert.equal(preview.records[0].status,'conflict');assert(preview.records[0].mappedOfferingIds.includes(physical.record.id));await q('POST','/mappings',{recordKey:randomUUID(),offeringId:other.record.id,observationId:refreshed.stored.id,status:'verified'},409);assert.deepEqual(await current('/mappings',mapping.id),mapping);}
  assert.equal(mapping.mapping.provider.moduleInstallationId,sourcePin.providerInstallationId);assert.equal(mapping.mapping.provider.packageDigest,sourcePin.packageDigest);
 });

 await test('Extension definitions require attested reads and cannot smuggle authority through typed values',async()=>{
  const source={contractVersion:1,sourceRecordId:'extension-'+randomUUID(),sourceStreamId:'catalog_extension_definitions',sourceRevision:1,observedAt:new Date().toISOString(),key:'support-terms',attributes:[{contractVersion:1,key:'warranty',name:'Warranty description',type:'text',required:true,maxLength:40}]},read=await beginRead(source,'extension-definition');await finishRead(read);const job=await current('/read-jobs',read.job.id),definition=(await listing('/extension-definitions')).find(d=>d.id===job.definitionId);assert(definition);assert.equal(definition.definition.provider.moduleInstallationId,sourcePin.providerInstallationId);
  const f=offerings.get('digital'),input={recordKey:randomUUID(),offeringId:f.record.id,definitionId:definition.id,values:[{key:'warranty',valueType:'text',valueText:'Synthetic support terms'}]};
  await q('POST','/extension-definitions',{...source,verified:true},403);await q('POST','/extensions',{...input,definitionId:randomUUID()},404);await q('POST','/extensions',{...input,values:[{key:'execute',valueType:'text',valueText:'arbitrary code'}]},422);
  for(const patch of [{provider:providerIdentity},{moduleId:manifest.moduleId},{definitionRevision:99},{permissions:['admin']}])await q('POST','/extensions',{...input,...patch},400);
  const saved=(await q('POST','/extensions',input,201)).record,view=(await q('GET','/catalog-view?q='+f.record.id)).records[0];assert.equal(saved.extension.provider.moduleInstallationId,sourcePin.providerInstallationId);assert(view.extensions.some(e=>e.key===source.key&&e.definitionRevision===1&&e.values[0].value==='Synthetic support terms'));
  const changed=await beginRead({...source,attributes:[{...source.attributes[0],maxLength:200}]},'extension-definition');await finishRead(changed,changed.source,sourcePin,409);
 });

 // Domain-specific child resources, governed source observations and read
 // contracts are appended below; every assertion targets the actual module.

 await test('Required definition evolution preserves inactive and archived offerings without rewriting history',async()=>{
  const archived=await make('service',{status:'inactive'});archived.record=(await action('/archive',archived.record)).record;
  const before=(await q('GET','/history?q='+archived.record.id)).records;
  const d=(await q('POST','/attribute-definitions',{recordKey:randomUUID(),key:'future-service-reference',name:'Future service reference',type:'text',required:true,scope:'offering',offeringTypes:['service']},201)).record;
  assert.deepEqual((await q('GET','/history?q='+archived.record.id)).records,before);
  assert.equal((await q('GET','/catalog-view?q='+archived.record.id)).records[0].status,'archived');
  const inactive=await make('service',{status:'inactive'});await update('/offerings',inactive.input,inactive.record,{status:'active'},422);
  await q('POST','/attributes',{recordKey:randomUUID(),offeringId:inactive.record.id,definitionId:d.id,valueType:'text',valueText:'Reviewed service reference'},201);
  inactive.record=await current('/offerings',inactive.record.id);const activated=(await update('/offerings',inactive.input,inactive.record,{status:'active'})).record;assert.equal(activated.status,'active');
 });
 await test('Inactive variants defer new required attributes until activation under an active parent',async()=>{
  const parent=await make('digital',{status:'active'}),input={recordKey:randomUUID(),offeringId:parent.record.id,code:'INACTIVE-EVOLUTION',name:'Inactive evolving variant',status:'inactive',unitOfMeasure:'license'},variant=(await q('POST','/variants',input,201)).record;
  const d=(await q('POST','/attribute-definitions',{recordKey:randomUUID(),key:'future-digital-license',name:'Future digital license',type:'text',required:true,scope:'variant',offeringTypes:['digital']},201)).record;
  assert.equal((await q('GET','/catalog-view?q='+parent.record.id)).records[0].variants.find(v=>v.id===variant.id).status,'inactive');
  await update('/variants',input,variant,{status:'active'},422);
  await q('POST','/attributes',{recordKey:randomUUID(),offeringId:parent.record.id,variantId:variant.id,definitionId:d.id,valueType:'text',valueText:'Reviewed license'},201);
  const activated=(await update('/variants',input,variant,{status:'active'})).record;assert.equal(activated.status,'active');
 });

 await test('Restart preserves catalog identity, histories and authoritative records',async()=>{
  const before=(await pool.query('SELECT id,kind,key,data,revision FROM business_records ORDER BY id')).rows;await app.close();app=start();assert.deepEqual((await pool.query('SELECT id,kind,key,data,revision FROM business_records ORDER BY id')).rows,before);const rows=await listing('/offerings');for(const f of offerings.values())assert(rows.some(r=>r.id===f.record.id));await q('GET','/ready');
 });
}finally{
 await app?.close();await pool?.end();try{docker(['rm','-f',container]);}catch{}
 await rm(secretFile,{force:true});
}
