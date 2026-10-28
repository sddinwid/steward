// Explicit human review ONLY, never a model run or source/lease renewal.
// First run verify-phase15-installed-catalog-ollama.mjs --execute-authorized --defer-finding ... .
// Read the report's ENTIRE result.narrative against original evidence; reject incorrect units/revenue/claims.
// Only after actual human approval:
// node scripts/finalize-phase15-catalog-review.mjs --execute-authorized --report <awaiting-review.json>
//   --reviewed-narrative-sha256 <report.reviewNarrativeDigest> [--directory <selected>] [--output <new-final-report.json>]
// Publication and affected-Worker ACK use actual UI. The original report stays untouched.
// Expired/changed evidence fails closed; do not alter saved leases/narrative or run a model from this helper.
// A failed atomic publication retains output.tmp with the exact prepared UI-response proof.
// Reconcile/publish that snapshot explicitly after permanent failure; never repeat an ACK to invent provenance.
import assert from 'node:assert/strict';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {publishPreparedLedger} from './phase15-ledger.mjs';
const {values}=parseArgs({options:{'execute-authorized':{type:'boolean'},report:{type:'string'},directory:{type:'string'},output:{type:'string'},'reviewed-narrative-sha256':{type:'string'}}});
if(!values['execute-authorized'])throw Error('Explicit operator readiness and actual human narrative review required');
assert(values.report&&/^[a-f0-9]{64}$/.test(values['reviewed-narrative-sha256']??''),'Supply exact reviewed narrative digest after human inspection');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),sourceFile=path.resolve(values.report),sourceText=await readFile(sourceFile,'utf8'),native=JSON.parse(sourceText);
assert.equal(native.status,'awaiting-review');assert.equal(native.findingDeferred,true);assert(!native.findingId&&native.deliveries.length===0,'Deferred report cannot already contain finding or acknowledgement');assert.equal(native.purpose,'simulation');assert.equal(native.investigationStatus,'completed');assert.equal(native.testModel,false);assert.equal(native.configurationRestored,true);assert.deepEqual(native.cleanupErrors,[]);
const nativeCatalogAnalyses=native.result.analyses.filter(a=>a.catalogCalculationId);assert(nativeCatalogAnalyses.length);assert.equal(native.catalogCalculationId,nativeCatalogAnalyses.at(-1).catalogCalculationId,'Finding endpoint publishes the LAST Catalog analysis; reviewed calculation must match it');
const load=relative=>import(pathToFileURL(path.join(root,relative)).href),{canonical,digest}=await load('packages/module-sdk/dist/index.js'),{validateCatalogNarrative,newCatalogPlan}=await load('packages/platform/dist/catalog-investigation.js'),{recomputePublishedContribution}=await load('packages/platform/dist/catalog-intelligence-calculation.js');
assert.equal(digest(native.result.narrative),native.reviewNarrativeDigest);assert.equal(values['reviewed-narrative-sha256'],native.reviewNarrativeDigest,'Review must refer to this exact immutable narrative');
const selection=JSON.parse(await readFile(path.join(root,'.steward/operator/selection.json'),'utf8')),directory=path.resolve(values.directory??selection.directory);assert.equal(directory,path.resolve(selection.directory));
const output=path.resolve(values.output??sourceFile.replace(/\.json$/i,'')+'-human-reviewed.json');assert.notEqual(output,sourceFile,'Original deferred report must remain untouched');
const previous=existsSync(output)?JSON.parse(await readFile(output,'utf8')):null;if(previous){assert.notEqual(previous.status,'passed','Retain completed final review evidence; choose a new output only for a separately reviewed operation');assert.equal(previous.investigationId,native.investigationId);assert.equal(previous.deferredReportDigest,digest(sourceText));assert.equal(previous.reviewNarrativeDigest,native.reviewNarrativeDigest);}
const oldArgv=process.argv.slice(),oldCwd=process.cwd(),oldCredentials=process.env.STEWARD_SEED_CREDENTIALS_FILE;process.argv[2]=directory;process.env.STEWARD_SEED_CREDENTIALS_FILE=path.join(directory,'demo/presenter.json');process.chdir(root);
const report={...native,status:'not_verified',deferredReport:sourceFile,deferredReportDigest:digest(sourceText),finalizationStartedAt:new Date().toISOString(),humanReview:{explicitlyInvoked:true,narrativeDigest:native.reviewNarrativeDigest},publicationAttempt:previous?.publicationAttempt??false,findingId:previous?.findingId,actions:[...(previous?.actions??[])],deliveries:[],checks:[...native.checks],cleanupErrors:[],publishedThroughUI:false,launchedThroughUI:false};let session;
async function persist(){await mkdir(path.dirname(output),{recursive:true});await writeFile(output+'.tmp',JSON.stringify(report,null,2)+'\n');await publishPreparedLedger(output+'.tmp',output);assert.equal(await readFile(sourceFile,'utf8'),sourceText,'Deferred report changed during human finalization');}
try{
 const c=await load('scripts/phase4-client.mjs');await c.logins();const api=c.api,manifest=c.deployment;assert.equal(native.sources.length,2);const sourceKeys=new Set(native.sources.map(s=>canonical(s.reference)));assert.equal(sourceKeys.size,2);
 async function validateCurrent(){
  const live=(await api('master','/api/v5/analyst/investigations/'+native.investigationId)).value;assert.equal(live.investigation.status,'completed');assert.equal(live.investigation.test_model,false);assert.equal(canonical(live.investigation.result),canonical(native.result),'Same investigation result and exact original narrative required');
  validateCatalogNarrative(live.investigation.result,newCatalogPlan('simulation'),live.investigation.result.analyses);
  const analysis=live.investigation.result.analyses.filter(a=>a.catalogCalculationId).at(-1);assert(analysis);assert.equal(analysis.catalogCalculationId,native.catalogCalculationId,'Current LAST Catalog analysis must be the explicitly reviewed calculation');assert.deepEqual(new Set(analysis.supportingReferences.map(canonical)),sourceKeys);
  const calculation=(await api('master','/api/v15/catalog-intelligence/calculations/'+native.catalogCalculationId)).value;assert.deepEqual(new Set(calculation.sourceReferences.map(canonical)),sourceKeys);
  for(const source of native.sources){
   assert(manifest.instances.some(i=>i.role==='worker'&&i.installationId===source.reference.installationId));let offset=0,publication,evidence=[],complete=false;
   for(let page=0;page<8;page++){const r=(await api('master','/api/v15/catalog-intelligence/evidence','POST',{reference:source.reference,limit:8,offset})).value;assert.equal(r.publication.current,true,'Source withdrawn, expired, or unavailable');assert.equal(canonical(r.publication.reference),canonical(source.reference));assert.equal(r.completeness.complete,true);publication=r.publication.projection;for(const e of r.evidence){assert.equal(e.available,true);assert(e.projection);evidence.push(e.projection);}if(r.nextOffset===null){complete=true;break;}offset=r.nextOffset;}
   assert(complete&&publication);assert.equal(publication.purpose,'simulation');assert(Date.parse(publication.validUntil)>Date.now(),'Original source lease expired; no renewal is permitted');const recalculated=recomputePublishedContribution(publication,evidence);assert.equal(recalculated.baseline.status,'complete');for(const[key,field]of[['revenueCents','revenueCents'],['variableCostCents','totalVariableCostCents'],['contributionCents','contributionCents']])assert.equal(recalculated.baseline[field],source.independentOracle[key]);
  }
  return live;
 }
 let live=await validateCurrent();const {operatorCatalogBrowserSession}=await load('scripts/phase15-operator-catalog-browser-session.mjs');report.screenshotPrefix='phase15-i-human-review-'+native.investigationId;session=await operatorCatalogBrowserSession(report.screenshotPrefix);
 // Freshness is checked again after UI login; server publication independently revalidates too.
 live=await validateCurrent();
 if(live.investigation.finding_id){assert(report.publicationAttempt,'Unexpected preexisting finding; reconcile without adopting it');assert(!report.findingId||report.findingId===live.investigation.finding_id);report.findingId=live.investigation.finding_id;}
 else{assert(!report.findingId);report.publicationAttempt=true;await persist();const published=await session.publish(native.investigationId);report.findingId=published.value.findingId;assert(report.findingId);}
 report.publishedThroughUI=true;await persist();const same=(await api('master','/api/v5/analyst/investigations/'+native.investigationId)).value;assert.equal(same.investigation.finding_id,report.findingId);assert.equal(same.investigation.result.narrative,native.result.narrative);
 for(const instance of manifest.instances.filter(i=>i.role==='worker')){
  const source=native.sources.find(s=>s.reference.installationId===instance.installationId);let local;
  if(!source){local=(await api(instance.key,'/api/v4/findings')).value.findings.find(f=>f.finding_id===report.findingId);assert(!local,'Unrelated Worker must not receive the finding');continue;}
  local=await c.waitFor(async()=>(await api(instance.key,'/api/v4/findings')).value.findings.find(f=>f.finding_id===report.findingId),'same finding delivery to affected '+instance.key,120000);assert.deepEqual(local.payload.affectedEntities,[source.reference.entityId]);assert(local.payload.supportingReferences.length>0&&local.payload.supportingReferences.every(r=>r.entityId===source.reference.entityId&&r.installationId===instance.installationId),'Other-entity evidence must remain redacted');
  const page=await session.login(instance.key);await page.goto(c.origin(instance.key)+'/#/business/findings/'+report.findingId);const card=page.getByTestId('finding-'+report.findingId);await card.waitFor();
  if(local.status!=='acknowledged'){const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v4/findings/'+report.findingId&&r.request().method()==='PUT');await card.getByRole('button',{name:/Acknowledge/i}).click();const response=await pending;assert.equal(response.status(),200);assert.equal(response.request().postDataJSON().status,'acknowledged');report.actions??=[];report.actions.push({worker:instance.key,kind:'ui-acknowledgement',findingId:report.findingId,at:new Date().toISOString()});await persist();}
  else assert(previous?.actions?.some(a=>a.kind==='ui-acknowledgement'&&a.worker===instance.key&&a.findingId===report.findingId),'Existing acknowledgement needs recorded prior UI action; reconcile unknown acknowledgement provenance');
  const receipt=await c.waitFor(async()=>(await api('master','/api/v4/findings')).value.receipts.find(r=>r.finding_id===report.findingId&&r.installation_id===instance.installationId&&r.status==='acknowledged'),'actual signed UI acknowledgement at Master '+instance.key,120000);report.deliveries.push({worker:instance.key,entityId:source.reference.entityId,installationId:instance.installationId,affected:true,received:true,acknowledged:true,acknowledgedThroughUI:true,findingId:report.findingId,receipt:{status:receipt.status,revision:receipt.revision,eventId:receipt.event_id}});await persist();
 }
 assert.equal(report.deliveries.length,2);for(const instance of manifest.instances.filter(i=>i.role==='worker'&&!native.sources.some(s=>s.reference.installationId===i.installationId)))assert(!(await api(instance.key,'/api/v4/findings')).value.findings.some(f=>f.finding_id===report.findingId),'Unrelated Worker remains excluded after ACKs');
 await session.verify(report);assert.deepEqual(session.errors,[]);report.checks.push('Explicit human-approved exact narrative passed current validator/current original evidence; same investigation published through actual UI and only affected Workers acknowledged through UI with actual Master receipts');report.status='passed';
}catch(error){report.status='failed';report.failure=error.message;process.exitCode=1;}
finally{if(session)try{await session.close();}catch(e){report.cleanupErrors.push(e.message);}process.chdir(oldCwd);process.argv.splice(0,process.argv.length,...oldArgv);if(oldCredentials===undefined)delete process.env.STEWARD_SEED_CREDENTIALS_FILE;else process.env.STEWARD_SEED_CREDENTIALS_FILE=oldCredentials;report.finalizationFinishedAt=new Date().toISOString();if(report.cleanupErrors.length){report.status='failed';process.exitCode=1;}await persist();console.log('Human review finalization: '+output);}
