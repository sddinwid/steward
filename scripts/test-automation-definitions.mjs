// Actual isolated module persistence and authenticated gateway injection.
// No claim of Worker sessions, installed package, approved binding or execution.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {createBusinessServer} from '../packages/business-kit/dist/index.js';
import {digest,validateManifest} from '../packages/module-sdk/dist/index.js';
import {privateDirectory} from '../tools/installer/dist/security.js';
import {automation} from '../modules/business-automation/dist/definition.js';
const directory='.steward/phase16-definition-tests',container='steward-automation-test-'+randomUUID(),secretFile=directory+'/'+container+'.env';
const password=randomBytes(32).toString('hex'),token=randomBytes(32).toString('hex'),installationId=randomUUID(),entityId=randomUUID(),author=randomUUID(),reviewer=randomUUID();
const manifest=JSON.parse(await readFile('modules/business-automation/manifest.json','utf8')),permissions=[...new Set(manifest.api.map(a=>a.permission))];
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
let pool,app;
const report={scope:'Isolated module database and real Fastify authentication/permission checks, host-principal headers are explicit fixtures. No installed runtime or operational workflow effects.',checks:[]};
const graph=()=>({graphVersion:1,nodes:[{id:'start',kind:'trigger',label:'Start'},{id:'reserve',kind:'action',label:'Synthetic reservation definition',bindingId:randomUUID(),operation:'stock.reserve',inputs:{orderId:{literal:randomUUID()},lines:{array:[{object:{sku:{literal:'SYNTHETIC-SKU'},quantity:{literal:2}}}]}}},{id:'done',kind:'completion',label:'Complete'}],edges:[{from:'start',to:'reserve',port:'next'},{from:'reserve',to:'done',port:'next'}],limits:{elapsedMs:60000,maxParallel:1,maxActions:4}});
const reviewHeader=(actors=[reviewer],issuedAt=Date.now())=>({'x-steward-approval-principals':JSON.stringify({issuedAt,reviewerPermission:'steward.automation.approve',actors})});
async function request(method,url,payload,status=200,who=author,allowed=permissions,headers={}){const r=await app.inject({method,url,headers:{authorization:'Bearer '+token,'x-steward-actor':who,'x-steward-permissions':JSON.stringify(allowed),...headers},...(payload===undefined?{}:{payload})});assert.equal(r.statusCode,status,method+' '+url+': '+r.body);return r.json();}
async function check(name,run){await test(name,async()=>{try{await run();report.checks.push({name,status:'passed'});}catch(e){report.checks.push({name,status:'failed',error:e.message});throw e;}});}
let created,published,reviewBody,draft;
try{
 validateManifest(manifest);await mkdir(directory,{recursive:true});privateDirectory(directory);await writeFile(secretFile,'POSTGRES_PASSWORD='+password+'\n',{mode:0o600});docker(['run','--rm','-d','--name',container,'--env-file',secretFile,'-p','127.0.0.1::5432','postgres:17.10-alpine']);
 const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort);pool=new pg.Pool({host:'127.0.0.1',port,user:'postgres',password});for(let n=0;;n++){try{await pool.query('SELECT 1');break;}catch(e){if(n===40)throw e;await delay(250);}}
 const sql=await readFile('modules/business-automation/migrations/001-foundation.sql','utf8');assert.equal(digest(sql),manifest.persistence.migrations[0].sha256);await pool.query(sql);
 const start=(scope=entityId,limit=600000)=>createBusinessServer(pool,token,{installationId,entityId:scope,configuration:{maxElapsedMs:limit,maxParallel:2}},automation(manifest),async()=>1,async()=>{});app=start();
 await check('independent module denies missing gateway authentication and local permissions',async()=>{
  assert.equal((await app.inject({method:'GET',url:'/workflows'})).statusCode,401);await request('GET','/workflows',undefined,403,author,[]);
 });
 await check('workflow drafts persist and publication snapshots are immutable and idempotent',async()=>{
  draft={recordKey:randomUUID(),name:'Synthetic reservation review',description:'Isolated definition only; does not reserve any business stock.',graph:graph()};created=(await request('POST','/workflows',draft,201)).record;
  const action={revision:created.revision,requestId:randomUUID()};published=await request('POST','/publish/'+created.id,action);
  assert.equal(published.executionActivated,false);assert.deepEqual(await request('POST','/publish/'+created.id,action),published);
  assert.equal(Number((await pool.query('SELECT count(*) n FROM workflow_publications')).rows[0].n),1);
  await assert.rejects(pool.query("UPDATE workflow_publications SET definition='{}' WHERE id=$1",[published.publicationId]),/append only/);
 });
 await check('review requires a distinct current human and cannot be self-approved',async()=>{
  reviewBody={recordKey:randomUUID(),publicationId:published.publicationId,decision:'approve',reason:'Reviewed bounded synthetic workflow definition; execution still requires Worker approval.',validForMinutes:60};
  await request('POST','/reviews',reviewBody,403,author,permissions,reviewHeader([author]));
  await request('POST','/reviews',reviewBody,403,reviewer,permissions,reviewHeader([],Date.now()));
  await request('POST','/reviews',reviewBody,403,reviewer,permissions,reviewHeader([reviewer],Date.now()-10000));
  const result=await request('POST','/reviews',reviewBody,201,reviewer,permissions,reviewHeader());assert.equal(result.record.actorId,reviewer);
  assert.equal(Number((await pool.query('SELECT count(*) n FROM workflow_reviews')).rows[0].n),1);
 });
 await check('review retries retain one receipt and recheck reviewer revocation',async()=>{
  const replay=await request('POST','/reviews',reviewBody,201,reviewer,permissions,reviewHeader());assert.equal(replay.replayed,true);
  await request('POST','/reviews',reviewBody,403,reviewer,permissions,reviewHeader([]));
  await assert.rejects(pool.query('DELETE FROM workflow_reviews WHERE publication_id=$1',[published.publicationId]),/append only/);
 });
 await check('editing a later draft preserves the exact original published definition',async()=>{
  const before=(await pool.query('SELECT definition,digest FROM workflow_publications WHERE id=$1',[published.publicationId])).rows[0];
  const edited=await request('PUT','/workflows/'+created.id,{...draft,name:'Synthetic revision two',revision:published.record.revision});
  assert.equal(edited.record.status,'draft');assert.deepEqual((await pool.query('SELECT definition,digest FROM workflow_publications WHERE id=$1',[published.publicationId])).rows[0],before);
 });
 await check('module restart preserves records and another entity cannot list or mutate them',async()=>{
  await app.close();app=start();assert.equal((await request('GET','/workflows')).records.length,1);
  await app.close();app=start(randomUUID());assert.equal((await request('GET','/workflows')).records.length,0);assert.equal((await request('GET','/reviews')).records.length,0);
  assert.equal((await request('GET','/publications')).records.length,0);await request('POST','/publish/'+created.id,{revision:3,requestId:randomUUID()},404);
  await app.close();app=start();
 });
 await check('read-only MCP status excludes graph inputs, source records and approval identities',async()=>{
  const value=await request('GET','/workflow-status');assert.deepEqual(Object.keys(value.records[0]).sort(),['id','name','status','version']);assert(!JSON.stringify(value).includes('SYNTHETIC-SKU'));
  assert(manifest.mcpTools.every(t=>manifest.api.find(a=>a.operationId===t.operationId).method==='GET'));
 });
 await check('invalid definitions return explicit validation errors and create no publication',async()=>{
  const bad=graph();bad.edges=[];const row=(await request('POST','/workflows',{recordKey:randomUUID(),name:'Invalid synthetic definition',description:'Retained invalid draft for validation acceptance.',graph:bad},201)).record;
  const before=Number((await pool.query('SELECT count(*) n FROM workflow_publications')).rows[0].n);
  const response=await request('POST','/publish/'+row.id,{revision:row.revision,requestId:randomUUID()},422);assert.match(response.error,/Workflow validation failed/);
  assert.equal(Number((await pool.query('SELECT count(*) n FROM workflow_publications')).rows[0].n),before);
 });
 await check('publication cannot invent a reviewer permission outside its signed module declaration',async()=>{
  const bad=graph();bad.nodes[1]={id:'reserve',kind:'approval',label:'Unsupported role',approverPermission:'example.other.approve',separateInitiator:true,expiresAfterMs:30000};bad.nodes.push({id:'rejected',kind:'completion',label:'Rejected'},{id:'expired',kind:'completion',label:'Expired'});bad.edges=[{from:'start',to:'reserve',port:'next'},{from:'reserve',to:'done',port:'approved'},{from:'reserve',to:'rejected',port:'rejected'},{from:'reserve',to:'expired',port:'expired'}];
  const row=(await request('POST','/workflows',{recordKey:randomUUID(),name:'Invalid reviewer permission',description:'Synthetic approval policy rejection.',graph:bad},201)).record;
  const response=await request('POST','/publish/'+row.id,{revision:row.revision,requestId:randomUUID()},422);assert.match(response.error,/signed module reviewer declaration/);
 });
 await check('tightened current module limits block old publications without rewriting their snapshots',async()=>{
  const before=(await pool.query('SELECT definition,digest FROM workflow_publications WHERE id=$1',[published.publicationId])).rows[0];await app.close();app=start(entityId,1000);
  const current=(await request('GET','/publications?q='+published.publicationId)).records[0];assert.equal(current.executionAllowed,false);assert.equal(current.executionBlock,'CURRENT_CONFIGURATION_OR_CONTRACT_INVALID');
  assert.deepEqual((await pool.query('SELECT definition,digest FROM workflow_publications WHERE id=$1',[published.publicationId])).rows[0],before);await app.close();app=start();
 });
 await check('publication discovery is paginated metadata while exact authorized inspection retains the full definition',async()=>{
  const page=await request('GET','/publications?limit=1&offset=0');assert.equal(page.records.length,1);assert.equal(page.records[0].definition,undefined);
  const detail=(await request('GET','/publications?q='+published.publicationId)).records[0];assert(detail.definition.graph);assert.equal(detail.definitionDigest,published.definitionDigest);
  await request('GET','/publications?limit=21',undefined,400);await request('GET','/publications?offset=-1',undefined,400);
 });
 report.status=report.checks.every(c=>c.status==='passed')?'passed':'failed';
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;}finally{await app?.close();await pool?.end();try{docker(['rm','-f',container]);}catch{}await unlink(secretFile).catch(()=>{});await mkdir('artifacts',{recursive:true});await writeFile('artifacts/phase16-automation-definitions.json',JSON.stringify(report,null,2)+'\n');}
