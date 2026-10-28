// Explicit selected-stack outage acceptance. Default mode has no operational side effects.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {canonical,digest} from '../packages/module-sdk/dist/index.js';
const {values}=parseArgs({options:{'execute-authorized':{type:'boolean',default:false}}});
const root=process.cwd(),selection=JSON.parse(await fs.readFile('.steward/operator/selection.json','utf8')),directory=path.resolve(selection.directory);
if(!values['execute-authorized']){console.log(JSON.stringify({executed:false,directory,scenario:'Stop Master API/web/scientific only; restart original Worker3 API/Catalog; create one separate synthetic service/publication via signed UI; restore finally',requires:'--execute-authorized, exclusive acceptance window with no Qwen or other scenario runners'}));process.exit(0);}
assert.equal(process.env.STEWARD_PHASE15_ROOT_READY,'1','Root must approve an exclusive outage window after backup');
process.argv[2]=directory;process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');
const client=await import('./phase13-acceptance-client.mjs'),{businessBrowser}=await import('./business-browser-client.mjs');
const C='steward.catalog.universal',W='worker-3',ledgerFile=path.join(directory,'demo/phase15-outage.json'),lock=ledgerFile+'.lock';
await fs.mkdir(path.dirname(ledgerFile),{recursive:true,mode:0o700});await fs.mkdir(lock);
const report={startedAt:new Date().toISOString(),scope:'Actual original selected operator, separate explicit synthetic service only; no external calls or financial mutations',checks:[],actions:[],browserErrors:[],cleanupErrors:[]};
let browser,restoreRequired=false,primaryError,state;
const docker=a=>execFileSync('docker',a,{encoding:'utf8',timeout:180000,stdio:['ignore','pipe','pipe']}).trim();
const container=service=>{const id=docker(['ps','-a','-q','--filter','label=com.docker.compose.project='+selection.project,'--filter','label=com.docker.compose.service='+service]);assert(id&&!id.includes('\n'),'Exact selected service required: '+service);return id;};
const services=['master-api','master-web','scientific'];
const sql=(worker,database,q)=>docker(['exec','-e','PGOPTIONS=-c default_transaction_read_only=on',container(worker+'-db'),'psql','-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1','-c',q]);
const moduleDb=id=>'m_'+digest(id).slice(0,20);
const scalar=(worker,database,q)=>JSON.parse(sql(worker,database,q));
const persist=async()=>{const tmp=ledgerFile+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(state,null,2)+'\n',{mode:0o600});await fs.rename(tmp,ledgerFile);};
const ready=async(worker)=>client.waitFor(async()=>{try{await client.api(worker,'/ready');return true;}catch{return false;}},worker+' readiness',180000);
const workersReady=()=>Promise.all(['worker-1','worker-2','worker-3'].map(ready));
const rows=(url)=>client.records(W,C,url);
async function protectedSnapshot(){
 const out={};
 for(const worker of ['worker-1','worker-2','worker-3']){
  out[worker]={enrollment:sql(worker,'steward',"SELECT md5(coalesce(string_agg(entity_id::text||state,',' ORDER BY entity_id),'')) FROM local_enrollment"),installations:sql(worker,'steward',"SELECT md5(coalesce(string_agg(md5(row_to_json(t)::text),',' ORDER BY module_id),'')) FROM (SELECT module_id,version,operation_id,state,descriptor,configuration FROM module_installations)t"),modules:{}};
  for(const moduleId of ['cee.sales','cee.inventory','cee.stock-ledger','steward.pricing.management',C]){
   const exists=sql(worker,'steward',`SELECT EXISTS(SELECT 1 FROM module_installations WHERE module_id='${moduleId}')`)==='t';if(!exists)continue;
   const database=moduleDb(moduleId),tables=moduleId==='cee.inventory'?['inventory_items','inventory_reservations','inventory_service_stock','inventory_service_reservations','verified_stock_obligations','module_identity']:moduleId==='cee.stock-ledger'?['business_records','verified_stock_obligations','module_identity']:moduleId==='cee.sales'?['business_records','sales_accepted_prices','sales_confirmation_intents','sales_publications','sales_analytical_attributions','module_identity']:moduleId===C?['module_identity']:['business_records','pricing_rule_versions','pricing_decisions','pricing_history','module_identity'];
   const values={};for(const table of tables){if(sql(worker,database,`SELECT to_regclass('public.${table}') IS NOT NULL`)!=='t')continue;values[table]=scalar(worker,database,`SELECT json_build_object('count',count(*),'sha',md5(coalesce(string_agg(h,',' ORDER BY h),''))) FROM (SELECT md5(row_to_json(t)::text) h FROM ${table} t)s`);}out[worker].modules[moduleId]=values;
  }
 }
 return out;
}
const pending=recordId=>scalar(W,'steward',`SELECT coalesce(json_agg(t ORDER BY event_id),'[]') FROM (SELECT event_id,md5(envelope::text) AS digest FROM sync_outbox WHERE acknowledged_at IS NULL AND envelope->>'moduleId'='${C}' AND envelope->>'streamId'='catalog_publications_v1' AND envelope->>'recordId'='${recordId}')t`);
try{
 assert.equal(client.deployment.project,selection.project);const identities=client.deployment.instances.map(({key,installationId})=>({key,installationId}));
 state=existsSync(ledgerFile)?JSON.parse(await fs.readFile(ledgerFile,'utf8')):{version:1,identities,code:'P15I-OUTAGE-'+randomUUID().slice(0,8).toUpperCase(),publicationUntil:new Date(Date.now()+1800000).toISOString(),phase:'planned'};
 assert.equal(state.version,1);assert.equal(canonical(state.identities),canonical(identities));await persist();
 if(state.restoreServices&&state.phase!=='completed'){
  for(const [service,id]of Object.entries(state.restoreServices))assert.equal(container(service),id,'Original stopped service changed; reconcile before retry');
  if(services.some(service=>!JSON.parse(docker(['inspect',container(service)]))[0].State.Running)){restoreRequired=true;client.compose('start',...services);}
 }
 await client.logins();await workersReady();await ready('master');
 if(state.phase==='completed'){report.checks.push('Original completed outage ledger reused; no duplicate service/publication or repeated outage');}
 else{
  assert(Date.parse(state.publicationUntil)>Date.now()+120000,'Original reviewed publication lease expired; explicit reconciliation required, never auto-renew');
  for(const service of services){const actual=JSON.parse(docker(['inspect',container(service)]))[0];assert.equal(actual.State.Running,true,'Outage must preserve original running-service topology');}
  state.restoreServices=Object.fromEntries(services.map(service=>[service,container(service)]));await persist();
  const original=await protectedSnapshot();state.protectedBefore??=original;assert.equal(canonical(original),canonical(state.protectedBefore),'Protected accepted data or source identities changed since outage plan');await persist();
  browser=await businessBrowser(report);await browser.open(W,C,'offering-editor');
  restoreRequired=true;client.compose('stop',...services);state.phase='master-stopped';await persist();
  for(const service of services)assert.equal(JSON.parse(docker(['inspect',container(service)]))[0].State.Running,false);
  await workersReady();report.checks.push('All Workers ready while Master API/web/scientific stopped; databases remain running');
  for(const worker of ['master','worker-1','worker-2','worker-3'])assert.equal(JSON.parse(docker(['inspect',container(worker+'-db')]))[0].State.Running,true);
  const matchingOfferings=(await rows('/offerings')).filter(r=>r.code===state.code);assert(matchingOfferings.length<=1,'Ambiguous outage offering; never create another');let offering=matchingOfferings[0];
  if(!offering){state.phase='offering-create-intent';await persist();offering=await browser.create(W,C,'offering-editor',{code:state.code,name:state.code+' Synthetic offline advisory session',description:'Separate explicit synthetic outage acceptance; no original cohort, physical definition, fulfillment or financial record changed.',type:'service',status:'active',duration:1,capacityUnit:'session',serviceDeliveryMethod:'remote',recurring:false,categoryIds:[],tags:['synthetic','phase15','outage'],promotionEligibility:false,promotionGroups:[],campaignReferences:[],media:[],availability:[{kind:'always'}]});}
  if(state.offeringId)assert.equal(offering.id,state.offeringId);state.offeringId=offering.id;await persist();
  const publications=(await rows('/analytical-overview')).filter(r=>r.offeringId===offering.id);assert(publications.length<=1,'Never create duplicate outage publications');let publication=publications[0];
  if(!publication){state.phase='publication-create-intent';await persist();publication=await browser.create(W,C,'overview',{offeringId:{label:offering.name},purpose:'simulation',reviewReason:state.code+' human reviewed SYNTHETIC SIMULATION outage disclosure only; no price, capacity, financial, production or programme authorization.',validUntil:state.publicationUntil});}
  if(publication.status==='draft'){state.phase='publication-publish-intent';await persist();await browser.action(W,C,'overview',publication,offering.name,'publishAnalytical');}
  publication=(await rows('/analytical-overview')).find(r=>r.id===publication.id);assert.equal(publication.status,'published');assert.equal(publication.projection.purpose,'simulation');
  const p=publication.projection;state.publicationId=publication.id;state.reference={entityId:p.entityId,installationId:p.installationId,moduleId:p.moduleId,streamId:'catalog_publications_v1',recordId:p.id,revision:p.revision};state.publicationDigest=digest(canonical(p));await persist();
  const queued=await client.waitFor(async()=>{const q=pending(p.id);return q.length?q:null;},'actual pending durable publication while Master unavailable');state.pending=queued;state.phase='publication-pending';await persist();report.checks.push('Ordinary signed UI created one separate synthetic service and human reviewed simulation publication; actual Worker core outbox is pending');
  const catalogContainer=docker(['ps','-q','--filter','label=steward.installation='+p.installationId,'--filter','label=steward.module='+C]);assert(catalogContainer&&!catalogContainer.includes('\n'),'Exactly one original Catalog container required');
  docker(['restart',container('worker-3-api')]);docker(['restart',catalogContainer]);await workersReady();
  const afterOffering=(await rows('/offerings')).find(r=>r.id===offering.id),afterPublication=(await rows('/analytical-overview')).find(r=>r.id===publication.id);assert.equal(canonical(afterOffering),canonical(offering));assert.equal(digest(canonical(afterPublication.projection)),state.publicationDigest);assert.equal(canonical(pending(p.id)),canonical(queued),'Durable original queue envelopes changed across restart');
  assert.equal(canonical(await protectedSnapshot()),canonical(state.protectedBefore),'Accepted sales/stock/ledger/prices/original source identities changed');state.phase='worker-restarted-pending';await persist();report.checks.push('Original Worker3 API and Catalog container restarted before Master recovery; accepted domain data, original identities and exact queued envelopes persisted');
 }
}catch(error){primaryError=error;}finally{
 if(browser)await browser.close().catch(e=>report.cleanupErrors.push(e.message));
 if(restoreRequired){try{client.compose('start',...services);await ready('master');await workersReady();report.checks.push('Master API/web/scientific and all Workers restored ready');}catch(e){report.cleanupErrors.push(e.message);}}
 try{execFileSync(process.execPath,['scripts/verify-single-stack.mjs'],{cwd:root,stdio:['ignore','pipe','pipe']});report.checks.push('Actual single selected stack verified');}catch(e){report.cleanupErrors.push('Single-stack verification failed');}
 try{
  if(!primaryError&&!report.cleanupErrors.length&&state?.reference){const evidence=await client.waitFor(async()=>{try{return(await client.api('master','/api/v15/catalog-intelligence/evidence','POST',{reference:state.reference})).value;}catch{return null;}},'actual Master full-six-namespace publication synchronization',180000);assert.equal(evidence.publication.projection.purpose,'simulation');assert.equal(digest(canonical(evidence.publication.projection)),state.publicationDigest);assert.equal(canonical(evidence.publication.reference),canonical(state.reference));state.phase='completed';state.completedAt=new Date().toISOString();await persist();report.reference=state.reference;report.checks.push('Master resolved the exact entity+Worker+module+stream+record+revision publication after recovery');}
 }catch(e){primaryError??=e;}
 report.completedAt=new Date().toISOString();report.passed=!primaryError&&!report.cleanupErrors.length;report.error=primaryError?.message??null;
 await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/phase15-outage.json',JSON.stringify(report,null,2)+'\n');await fs.rmdir(lock);
}
if(primaryError)throw primaryError;assert.equal(report.cleanupErrors.length,0,'Outage cleanup failed; inspect private deployment before further work');assert(report.passed);console.log('PASS selected-stack outage/restart/durable synchronization acceptance; no financial or external production mutation.');
