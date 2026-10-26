// Isolated database/in-process HTTP fixture; no operator deployment is changed.
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {privateDirectory} from '../tools/installer/dist/security.js';
import {createBusinessServer} from '../packages/business-kit/dist/index.js';
import {validateManifest,digest,validateCapabilityValue} from '../packages/module-sdk/dist/index.js';
import {assets} from '../modules/assets/dist/definition.js';
import {propertyAuthorityVerifyOutput} from '../modules/assets/dist/authority-contract.js';
const container='steward-assets-tests-'+randomUUID(),directory='.steward/phase13-assets-tests',secretFile=directory+'/'+randomUUID()+'.env';
await mkdir(directory,{recursive:true});privateDirectory(directory);
const password=randomBytes(32).toString('base64url');await writeFile(secretFile,'POSTGRES_PASSWORD='+password+'\n',{mode:0o600});
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
let pool,app;
try{
 docker(['run','--rm','-d','--name',container,'--env-file',secretFile,'-p','127.0.0.1::5432','postgres:17.10-alpine']);
 const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort);
 pool=new pg.Pool({host:'127.0.0.1',port,user:'postgres',password,database:'postgres',connectionTimeoutMillis:1000});
 for(let n=0;;n++){try{await pool.query('SELECT 1');break;}catch(e){if(n>=30)throw e;await delay(500);}}
 const manifest=JSON.parse(await readFile('modules/assets/manifest.json','utf8'));manifest.persistence.migrations=[];
 const files=(await readdir('modules/assets/migrations')).sort();
 for(let n=0;n<files.length;n++){const sql=await readFile('modules/assets/migrations/'+files[n],'utf8');await pool.query(sql);manifest.persistence.migrations.push({version:n+1,sha256:digest(sql)});}
 validateManifest(manifest);
 const entityId=randomUUID(),owner=randomUUID(),custodian=randomUUID(),user=randomUUID(),manager=randomUUID(),program=randomUUID(),sourceProgram=randomUUID(),actor=randomUUID(),installationId=randomUUID(),token=randomBytes(32).toString('base64url');
 const configuration={currency:'EUR',integrationsEnabled:true,syntheticServiceAuthority:true,serviceAuthorityProgramId:program,authorizedOwnerEntityIds:[owner],authorizedManagerEntityIds:[manager]};
 const runtime={installationId,entityId,configuration},all=[...new Set(manifest.api.map(o=>o.permission))];
 const start=()=>{app=createBusinessServer(pool,token,runtime,assets(manifest),async()=>1,async()=>{});};start();
 const q=async(method,url,payload,status=200,permissions=all)=>{const r=await app.inject({method,url,headers:{authorization:'Bearer '+token,'x-steward-actor':actor,'x-steward-permissions':JSON.stringify(permissions)},...(payload===undefined?{}:{payload})});assert.equal(r.statusCode,status,method+' '+url+': '+r.body);return r.json();};
 const scope={sourceEntityId:manager,sourceInstallationId:randomUUID(),sourceProgramId:sourceProgram,destinationEntityId:entityId,destinationInstallationId:installationId,destinationProgramId:program,consumerModuleId:'cee.housing-management',purpose:'housing-placement',grantId:randomUUID(),providerInstallationId:randomUUID(),packageDigest:'a'.repeat(64),expiresAt:Date.now()+3600000,sourceActorId:randomUUID(),destinationActorId:actor};
 const cmd=(payload,command='property.authority.verify')=>({protocol:'steward-module-integration-v1',commandId:randomUUID(),sourceModuleId:'cee.housing-management',targetModuleId:'cee.assets',command,version:1,aggregateId:randomUUID(),sequence:1,occurredAt:new Date().toISOString(),payload});
 const deliver=async(command,s=scope,status=200)=>{const r=await app.inject({method:'POST',url:'/integration-inbox',headers:{authorization:'Bearer '+token,'x-steward-integration-source':command.sourceModuleId,'x-steward-installation':installationId,'x-steward-capability':'property.authority',...(s?{'x-steward-peer-scope':JSON.stringify(s)}:{})},payload:command});assert.equal(r.statusCode,status,r.body);return r.json();};
 const relations={ownerEntityId:owner,custodianEntityId:custodian,userEntityId:user,accessBasis:'leased'};
 await q('POST','/facilities',{code:'RES',name:'Synthetic residential facility',site:'North',classification:'residential',...relations},201);
 const assetInput={code:'HOME',name:'Synthetic residence',facilityCode:'RES',site:'North',classification:'residential',...relations,capacityM3:100,utilizedM3:0,availability:'available',monthlyOperatingCostCents:125000,currency:'EUR'};
 let asset=(await q('POST','/assets',assetInput,201)).record;
 const payload=()=>({programId:program,sourceProgramId:sourceProgram,assetId:asset.id});
 const grantInput={number:'SYNREF-MANAGEMENT',assetId:asset.id,managedEntityId:manager,managedProgramId:sourceProgram,startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),accessBasis:'leased',authorityReference:'Synthetic reviewed management agreement'};
 let grant;
 await test('Canonical residential asset needs explicit reviewed management authority',async()=>{
  const authority=await q('GET','/program-authority?q='+program);assert.equal(authority.actorId,actor);assert.equal(authority.programId,program);assert.equal(authority.authorized,true);
  await q('GET','/program-authority?q='+randomUUID(),undefined,403);
  await q('GET','/program-authority?q='+program,undefined,403,['cee.assets.authority.write']);
  await deliver(cmd(payload()),scope,403);
  await q('POST','/management-authorities',{...grantInput,managedEntityId:randomUUID()},403);
  grant=(await q('POST','/management-authorities',grantInput,201)).record;
  await deliver(cmd(payload()),scope,403);
  const approval={revision:grant.revision,requestId:randomUUID()};
  await q('POST','/approve-management/'+grant.id,approval,403,['cee.assets.authority.write']);
  const approved=await q('POST','/approve-management/'+grant.id,approval);assert.deepEqual(await q('POST','/approve-management/'+grant.id,approval),approved);grant=approved.record;
  await q('PUT','/management-authorities/'+grant.id,{...grantInput,revision:grant.revision},409);
  const result=await deliver(cmd(payload()));validateCapabilityValue(result,propertyAuthorityVerifyOutput);
  assert.equal(result.managementAuthorityId,grant.id);assert.equal(result.ownerEntityId,owner);assert.equal(result.custodianEntityId,custodian);assert.equal(result.userEntityId,user);assert.equal(result.managerEntityId,manager);assert.notEqual(result.managerEntityId,result.ownerEntityId);assert(Date.parse(result.validUntil)<=Date.now()+60000);
 });
 await test('Peer programme/entity/consumer attestations and closed payload prevent authority substitution',async()=>{
  await deliver(cmd(payload()),null,403);
  for(const field of ['sourceEntityId','sourceProgramId','destinationProgramId','destinationEntityId','destinationInstallationId'])await deliver(cmd(payload()),{...scope,[field]:randomUUID()},403);
  await deliver(cmd(payload()),{...scope,consumerModuleId:'cee.sales'},403);
  await deliver(cmd({...payload(),programId:randomUUID()}),scope,403);
  await deliver(cmd({...payload(),sourceProgramId:randomUUID()}),scope,403);
  await deliver(cmd({...payload(),actorId:actor}),scope,403);
  await deliver(cmd({...payload(),managedEntityId:manager}),scope,403);
  await deliver(cmd(payload()),{...scope,expiresAt:Date.now()-1},403);
 });
 await test('Concurrent overlapping approvals are serialized and catalog only discloses authorized assets',async()=>{
  const drafts=await Promise.all(['OTHER1','OTHER2'].map(number=>q('POST','/management-authorities',{...grantInput,number},201)));
  await Promise.all(drafts.map(({record})=>q('POST','/approve-management/'+record.id,{revision:record.revision,requestId:randomUUID()},409)));
  const c=await deliver(cmd({programId:program,sourceProgramId:sourceProgram},'property.authority.catalog'));assert.equal(c.records.length,1);assert.equal(c.records[0].assetId,asset.id);assert.equal(c.nextOffset,null);
  const hidden=await deliver(cmd({programId:program,sourceProgramId:sourceProgram},'property.authority.catalog'),{...scope,sourceEntityId:randomUUID()});assert.deepEqual(hidden.records,[]);
  const second=(await q('POST','/assets',{...assetInput,code:'HOME2'},201)).record;
  const contenders=await Promise.all(['RACE1','RACE2'].map(number=>q('POST','/management-authorities',{...grantInput,number,assetId:second.id,startsAt:new Date(Date.now()+3600000).toISOString()},201)));
  const approvals=await Promise.all(contenders.map(({record})=>app.inject({method:'POST',url:'/approve-management/'+record.id,headers:{authorization:'Bearer '+token,'x-steward-actor':actor,'x-steward-permissions':JSON.stringify(all)},payload:{revision:record.revision,requestId:randomUUID()}})));
  assert.deepEqual(approvals.map(r=>r.statusCode).sort(),[200,409]);
 });
 await test('Persisted authority and duplicate receipts survive module restart without creating grants',async()=>{
  const c=cmd(payload()),before=await deliver(c),grantCount=(await q('GET','/management-authorities')).records.length;await app.close();start();assert.deepEqual(await deliver(c),before);assert.equal((await q('GET','/management-authorities')).records.length,grantCount);
  await deliver({...c,payload:{...c.payload,assetId:randomUUID()}},scope,409);
 });
 await test('Owner/config changes, current maintenance, unavailable state and expired grants deny new placement',async()=>{
  configuration.authorizedManagerEntityIds=[];await deliver(cmd(payload()),scope,403);configuration.authorizedManagerEntityIds=[manager];
  configuration.authorizedOwnerEntityIds=[];await deliver(cmd(payload()),scope,403);configuration.authorizedOwnerEntityIds=[owner];
  const replacementOwner=randomUUID();configuration.authorizedOwnerEntityIds.push(replacementOwner);
  asset=(await q('PUT','/assets/'+asset.id,{...assetInput,ownerEntityId:replacementOwner,revision:asset.revision})).record;await deliver(cmd(payload()),scope,403);
  asset=(await q('PUT','/assets/'+asset.id,{...assetInput,revision:asset.revision})).record;configuration.authorizedOwnerEntityIds=[owner];
  asset=(await q('PUT','/assets/'+asset.id,{...assetInput,availability:'unavailable',revision:asset.revision})).record;await deliver(cmd(payload()),scope,409);
  asset=(await q('PUT','/assets/'+asset.id,{...assetInput,revision:asset.revision})).record;
  await q('POST','/maintenance',{number:'SYNREF-CURRENT',assetCode:'HOME',description:'Synthetic current inspection',startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+60000).toISOString(),costCents:0},201);await deliver(cmd(payload()),scope,409);
  await pool.query("UPDATE business_records SET data=jsonb_set(data,'{status}','\"complete\"') WHERE kind='maintenance'");
  const future=Date.now()+20000;await q('POST','/maintenance',{number:'SYNREF-FUTURE',assetCode:'HOME',description:'Synthetic upcoming inspection',startsAt:new Date(future).toISOString(),endsAt:new Date(future+60000).toISOString(),costCents:0},201);assert(Date.parse((await deliver(cmd(payload()))).validUntil)<=future);
  await pool.query("UPDATE business_records SET data=jsonb_set(data,'{endsAt}',to_jsonb($2::text)) WHERE id=$1",[grant.id,new Date(Date.now()-1).toISOString()]);await deliver(cmd(payload()),scope,403);
 });
 await test('Minimal access audit records actual allowed/denied reviewer; no participant authority or Master projection added',async()=>{
  const audit=(await pool.query("SELECT * FROM asset_authority_access_audit WHERE operation_id='approveManagement' ORDER BY id")).rows;
  assert(audit.some(r=>r.actor===actor&&!r.allowed&&r.status_code===403));assert(audit.some(r=>r.actor===actor&&r.allowed));
  assert.equal((await pool.query("SELECT count(*)::int n FROM business_records WHERE kind IN ('participant','placement','occupancy')")).rows[0].n,0);
  assert(!manifest.replication?.streams?.some(s=>/management/.test(s.id??s.stream??'')));
 });
}finally{await app?.close();await pool?.end();try{docker(['rm','-f',container]);}catch{}await rm(secretFile,{force:true});}
