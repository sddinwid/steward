// Actual module publication/review APIs and independent Worker metadata database.
// Host transport is Fastify injection; no installed package or execution claim.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,generateKeyPairSync} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {createBusinessServer} from '../packages/business-kit/dist/index.js';
import {canonical,digest,signPackage} from '../packages/module-sdk/dist/index.js';
import {securityMigration} from '../packages/platform/dist/security/migration.js';
import {moduleMigration} from '../packages/platform/dist/module-migration.js';
import {verifyWorkflowPublication} from '../packages/module-host/dist/workflow-authority.js';
import {privateDirectory} from '../tools/installer/dist/security.js';
import {automation} from '../modules/business-automation/dist/definition.js';
const directory='.steward/phase16-authority-tests',container='steward-authority-test-'+randomUUID(),secretFile=directory+'/'+container+'.env';
const password=randomBytes(32).toString('hex'),token=randomBytes(32).toString('hex'),installationId=randomUUID(),entityId=randomUUID(),author=randomUUID(),reviewer=randomUUID(),moduleInstallationId=randomUUID();
const manifest=JSON.parse(await readFile('modules/business-automation/manifest.json','utf8')),permissions=[...new Set(manifest.api.map(a=>a.permission))];
if(process.argv.includes('--events'))manifest.smart.consumes.push({capabilityId:'fixture.stock.observe',contract:'fixture.stock.observe',minimumVersion:'1.0.0',maximumMajor:1,operations:[{name:'observe',input:{type:'object',additionalProperties:false,properties:{}},output:{type:'object',additionalProperties:false,properties:{}}}],events:[{name:'stock.changed',schema:{type:'object',additionalProperties:false,required:['id','revision','item_id','quantity'],properties:{id:{type:'string'},revision:{type:'integer',minimum:1},item_id:{type:'string'},quantity:{type:'integer',minimum:0}}}}],maximumSensitivity:'business',optional:true});
const keys=generateKeyPairSync('ed25519'),trust={publishers:[{publisherId:'test-only',publicKey:keys.publicKey.export({type:'spki',format:'pem'}).toString()}]};
const descriptor=signPackage({formatVersion:1,publisherId:'test-only',imageId:'sha256:'+'a'.repeat(64),manifest},keys.privateKey.export({type:'pkcs8',format:'pem'}).toString());
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
let moduleDb,metadata,app,pin,publicationId;
const report={scope:(process.argv.includes('--runtime')?'Additional coordinator tests use privileged projection/decision fixtures and a synthetic provider receipt database; no activation API, installed provider or business acceptance claim. ':'')+'Real module-owned publications, real independent Worker authorization database; synthetic signed package and injected host transport. No provider effects or installed execution acceptance.',checks:[]};
async function check(name,run){await test(name,async()=>{try{await run();report.checks.push({name,status:'passed'});}catch(e){report.checks.push({name,status:'failed',error:e.message});throw e;}});}
async function api(method,url,payload,actor=author){const r=await app.inject({method,url,headers:{authorization:'Bearer '+token,'x-steward-actor':actor,'x-steward-permissions':JSON.stringify(permissions),'x-steward-approval-principals':JSON.stringify({issuedAt:Date.now(),reviewerPermission:'steward.automation.approve',actors:[reviewer]})},...(payload===undefined?{}:{payload})});assert(r.statusCode>=200&&r.statusCode<300,r.body);return r.json();}
const transport=async(id,method,path,body,headers)=>{assert.equal(id,manifest.moduleId);const r=await app.inject({method,url:path,headers:{authorization:'Bearer '+token,...headers},...(body===undefined?{}:{payload:body})});return{status:r.statusCode,value:r.json()};};
const verify=(overrides={},call=transport,matches=async()=>true)=>verifyWorkflowPublication(metadata,trust,call,matches,{pin,installationId,entityId,actorId:author,...overrides});
async function readPin(){const row=(await api('GET','/publications?q='+publicationId)).records[0];return{moduleId:manifest.moduleId,moduleInstallationId,packageDigest:digest(canonical(descriptor)),publicationId,definitionDigest:row.definitionDigest,reviewId:row.review.id,reviewerId:row.review.reviewerId,reviewExpiresAt:row.review.expiresAt};}
async function review(decision){await api('POST','/reviews',{recordKey:randomUUID(),publicationId,decision,reason:'Explicit isolated human governance verification; no operational effects.',validForMinutes:60},reviewer);}
try{
 await mkdir(directory,{recursive:true});privateDirectory(directory);await writeFile(secretFile,'POSTGRES_PASSWORD='+password+'\n',{mode:0o600});docker(['run','--rm','-d','--name',container,'--env-file',secretFile,'-p','127.0.0.1::5432','postgres:17.10-alpine']);
 const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort),connection={host:'127.0.0.1',port,user:'postgres',password};
 moduleDb=new pg.Pool({...connection,database:'postgres'});for(let n=0;;n++){try{await moduleDb.query('SELECT 1');break;}catch(e){if(n===40)throw e;await delay(250);}}
 await moduleDb.query(await readFile('modules/business-automation/migrations/001-foundation.sql','utf8'));
 await moduleDb.query('CREATE DATABASE worker_authority');metadata=new pg.Pool({...connection,database:'worker_authority'});await metadata.query(securityMigration);await metadata.query(moduleMigration);
 await metadata.query("INSERT INTO security_accounts(account_id,username,password_hash,role) VALUES($1,'fixture-author','unusable-test-hash','local_admin'),($2,'fixture-reviewer','unusable-test-hash','module_user')",[author,reviewer]);
 await metadata.query("INSERT INTO module_installations(module_id,version,descriptor,configuration,state,operation_id) VALUES($1,$2,$3,$4,'active',$5)",[manifest.moduleId,manifest.version,descriptor,{maxElapsedMs:60000,maxParallel:1},moduleInstallationId]);
 await metadata.query('INSERT INTO module_permissions VALUES($1,$2,$3)',[reviewer,manifest.moduleId,'steward.automation.approve']);
 app=createBusinessServer(moduleDb,token,{installationId,entityId,configuration:{maxElapsedMs:60000,maxParallel:1}},automation(manifest),async()=>1,async()=>{});
 const graph={graphVersion:1,nodes:[{id:'start',kind:'trigger',label:'Start'},{id:'done',kind:'completion',label:'Done'}],edges:[{from:'start',to:'done',port:'next'}],limits:{elapsedMs:60000,maxParallel:1,maxActions:1}};
 const created=(await api('POST','/workflows',{recordKey:randomUUID(),name:'Publication authority fixture',description:'Synthetic definition; no business effects.',graph})).record;
 publicationId=(await api('POST','/publish/'+created.id,{revision:created.revision,requestId:randomUUID()})).publicationId;await review('approve');pin=await readPin();
 await check('exact signed publication and separate current reviewer resolve through the authoritative module API',async()=>{const d=await verify();assert.deepEqual(d.graph,graph);assert.equal(d.workflowId,created.id);assert.equal(digest(canonical(d)),pin.definitionDigest);});
 await check('another entity and altered source definition are rejected rather than trusted from projection',async()=>{
  await assert.rejects(()=>verify({entityId:randomUUID()}),/WORKFLOW_PUBLICATION_SCOPE_MISMATCH/);
  await assert.rejects(()=>verify({},async(...args)=>{const r=await transport(...args);r.value.records[0].executionAllowed=false;return r;}),/WORKFLOW_SOURCE_POLICY_REVIEW_REQUIRED/);
  await assert.rejects(()=>verify({},async(...args)=>{const r=await transport(...args);r.value.records[0].definition.name='Forged';return r;}),/WORKFLOW_PUBLICATION_CHANGED/);
 });
 await check('reinstallation, package replacement and configuration mismatch require review before transport',async()=>{
  let calls=0;const counted=async(...args)=>{calls++;return transport(...args);};
  await assert.rejects(()=>verify({pin:{...pin,moduleInstallationId:randomUUID()}},counted),/WORKFLOW_SOURCE_CHANGED/);
  await assert.rejects(()=>verify({pin:{...pin,packageDigest:'b'.repeat(64)}},counted),/WORKFLOW_SOURCE_CHANGED/);
  await assert.rejects(()=>verify({},counted,async()=>false),/WORKFLOW_SOURCE_CONFIGURATION_MISMATCH/);assert.equal(calls,0);
 });
 await check('review permission revoked during module transport is rechecked before returning authority',async()=>{
  try{await assert.rejects(()=>verify({},async(...args)=>{const r=await transport(...args);await metadata.query('DELETE FROM module_permissions WHERE account_id=$1',[reviewer]);return r;}),/WORKFLOW_REVIEWER_AUTHORITY_REVOKED/);}
  finally{await metadata.query('INSERT INTO module_permissions VALUES($1,$2,$3)',[reviewer,manifest.moduleId,'steward.automation.approve']);}
 });
 await check('requester revocation and provider identity change during transport cannot retain a cached authorization',async()=>{
  try{await assert.rejects(()=>verify({},async(...args)=>{const r=await transport(...args);await metadata.query('UPDATE security_accounts SET enabled=false WHERE account_id=$1',[author]);return r;}),/WORKFLOW_REQUESTER_AUTHORITY_REVOKED/);}
  finally{await metadata.query('UPDATE security_accounts SET enabled=true WHERE account_id=$1',[author]);}
  try{await assert.rejects(()=>verify({},async(...args)=>{const r=await transport(...args);await metadata.query('UPDATE module_installations SET operation_id=$1',[randomUUID()]);return r;}),/WORKFLOW_SOURCE_CHANGED/);}
  finally{await metadata.query('UPDATE module_installations SET operation_id=$1',[moduleInstallationId]);}
 });
 await check('real appended revocation and subsequent approval cannot silently replace the original review pin',async()=>{
  await review('revoke');await assert.rejects(()=>verify(),/WORKFLOW_REVIEW_CHANGED/);
  await review('approve');await assert.rejects(()=>verify(),/WORKFLOW_REVIEW_CHANGED/);pin=await readPin();await verify();
 });
 await check('expired or future-dated review fixtures and self-review fail independently of signature trust',async()=>{
  for(const change of [{expiresAt:new Date(Date.now()-1000).toISOString()}, {reviewedAt:new Date(Date.now()+3600000).toISOString()}]){
   await assert.rejects(()=>verify({pin:{...pin,...(change.expiresAt?{reviewExpiresAt:change.expiresAt}:{})}},async(...args)=>{const r=await transport(...args);Object.assign(r.value.records[0].review,change);return r;}),/WORKFLOW_REVIEW_EXPIRED_OR_INVALID/);
  }
  await assert.rejects(()=>verify({},async(...args)=>{const r=await transport(...args);r.value.records[0].authorId=reviewer;return r;}),/WORKFLOW_SEPARATE_REVIEW_REQUIRED/);
 });
 await check('source outage cannot produce authority and source records remain unchanged',async()=>{
  const before=(await moduleDb.query('SELECT definition,digest FROM workflow_publications WHERE id=$1',[publicationId])).rows[0];
  await assert.rejects(()=>verify({},async()=>({status:503,value:{error:'Unavailable'}})),/WORKFLOW_PUBLICATION_UNAVAILABLE/);
  assert.deepEqual((await moduleDb.query('SELECT definition,digest FROM workflow_publications WHERE id=$1',[publicationId])).rows[0],before);
 });
 if(process.argv.includes('--runtime')){
  const {exerciseGraphRuntime}=await import('./workflow-runtime-checks.mjs');
  await exerciseGraphRuntime({check,metadata,moduleDb,installationId,entityId,author,reviewer,manifest,descriptor,keys,trust,transport,api,publish:async graph=>{
    const created=(await api('POST','/workflows',{recordKey:randomUUID(),name:'Kernel '+randomUUID(),description:'Isolated coordinator fixture; no installed business acceptance.',graph})).record;
    publicationId=(await api('POST','/publish/'+created.id,{revision:created.revision,requestId:randomUUID()})).publicationId;await review('approve');pin=await readPin();return pin;
  }});
 }
 if(process.argv.includes('--governance')){
  const {exerciseWorkflowGovernance}=await import('./workflow-governance-checks.mjs');
  await exerciseWorkflowGovernance({check,metadata,installationId,entityId,author,reviewer,manifest,trust,transport,verify,api,publish:async graph=>{
    const created=(await api('POST','/workflows',{recordKey:randomUUID(),name:'Governance '+randomUUID(),description:'Real session and CSRF governance fixture; no installed provider.',graph})).record;
    publicationId=(await api('POST','/publish/'+created.id,{revision:created.revision,requestId:randomUUID()})).publicationId;await review('approve');pin=await readPin();return pin;
  }});
 }
 if(process.argv.includes('--events')){
  const {exerciseWorkflowEventAdmission}=await import('./workflow-event-admission-checks.mjs');
  await exerciseWorkflowEventAdmission({check,metadata,installationId,entityId,author,reviewer,manifest,descriptor,keys,trust,transport,api,publish:async graph=>{
   const created=(await api('POST','/workflows',{recordKey:randomUUID(),name:'Event '+randomUUID(),description:'Signed synthetic event admission fixture; no installed provider.',triggerSource:'fixture.stock.observe/stock.changed',graph})).record;
   publicationId=(await api('POST','/publish/'+created.id,{revision:created.revision,requestId:randomUUID()})).publicationId;await review('approve');pin=await readPin();return pin;
  }});
 }
 report.status=report.checks.every(c=>c.status==='passed')?'passed':'failed';
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;}finally{
 await app?.close();await metadata?.end();await moduleDb?.end();try{docker(['rm','-f',container]);}catch{}await unlink(secretFile).catch(()=>{});
 await mkdir('artifacts',{recursive:true});await writeFile(process.argv.includes('--events')?'artifacts/phase16-workflow-event-admission.json':process.argv.includes('--runtime')?'artifacts/phase16-graph-runtime.json':process.argv.includes('--governance')?'artifacts/phase16-workflow-governance.json':'artifacts/phase16-workflow-authority.json',JSON.stringify(report,null,2)+'\n');
}
