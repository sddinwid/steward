// Real synthetic Participant -> Housing path through signed, approved SSMA.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {api,logins,deployment,origin,sessions,waitFor,directory,moduleApi,installed,records,seedRecord,action,ensureInstalled,sectionState,ensurePeerWorkflow,entityId,workerIdentity} from './phase13-acceptance-client.mjs';
const moduleId='steward.housing.services',housing='steward.housing.management',source='worker-3',destination='worker-1';
const {state,persist}=await sectionState('participants'),base=JSON.parse(await readFile(path.join(directory,'demo/phase13.json'),'utf8'));
state.cases??=[];const report={verifiedAt:new Date().toISOString(),checks:[],syntheticOnly:true};let browser;
function pass(text){report.checks.push(text);console.log('PASS '+text);}
const find=async(w,m,url,id)=>(await records(w,m,url)).find(r=>r.id===id);
async function authCookies(context){for(const w of [source,destination]){const cookie=sessions[w].cookie,at=cookie.indexOf('=');await context.addCookies([{name:cookie.slice(0,at),value:cookie.slice(at+1),url:origin(w),secure:true,httpOnly:true,sameSite:'Strict'}]);}}
async function housingBrowserAction(page,row,operationId){const contribution=(await installed(destination,housing)).manifest.ui.find(s=>s.screenId==='placements'),operation=contribution.actions.find(a=>a.operationId===operationId);assert(operation);await page.goto(origin(destination)+'/#/business/module/'+housing+'/placements');await page.reload();const view=page.getByTestId('module-screen-'+housing),label=/^[a-f0-9-]{36}$/i.test(row.code)?'Reference · '+row.code.slice(-8):row.code;const tr=view.getByRole('row').filter({has:view.getByText(label,{exact:true})});const pending=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/'+row.id));await tr.getByRole('button',{name:operation.label,exact:true}).click();const response=await pending;assert.equal(response.status(),200,await response.text());return response.json();}
try{
 await logins();const targetVersion='1.0.2';await ensureInstalled(source,moduleId,targetVersion,{syntheticOnly:true,integrationsEnabled:true});state.moduleVersion=targetVersion;await persist();
 const program=await seedRecord(source,moduleId,'/programs','P13-SUPPORT',{reference:randomUUID(),code:'P13-SUPPORT',name:'Synthetic Phase 13 Support',currency:'USD'},{keyField:'code'});state.programId=program.id;await persist();
 let relationship=await seedRecord(destination,housing,'/service-sources','P13-PARTICIPANT-SOURCE',{programId:base.housingProgramId,code:'P13-PARTICIPANT-SOURCE',sourceProgramId:program.id,sourceEntityId:entityId(source),sourceInstallationId:workerIdentity(source).installationId,sourceModuleId:moduleId,expiresAt:new Date(Date.now()+7*86400000).toISOString(),reason:'Synthetic human-reviewed support programme housing relationship'});
 if(relationship.status!=='approved')relationship=(await action(destination,housing,'/approve-source',relationship)).record;
 // Existing confirmed obligations retain their original provider/package pins.
 // A package upgrade does not authorize transferring or refreshing old work.
 const legacyConfirmed=state.cases.length===6&&state.cases.every(c=>c.referral?.providerStatus?.confirmed&&c.referral?.provider);
 if(!legacyConfirmed)await ensurePeerWorkflow({section:'participants',key:'housing',source,destination,consumerId:moduleId,providerId:housing,sourceProgramId:program.id,destinationProgramId:base.housingProgramId,capabilityId:'housing.placement',operations:['housing.placement.request','housing.placement.status','housing.placement.withdraw','housing.capacity.observe'],purpose:'housing.placement',authorityReference:relationship.id});
 for(let n=1;n<=12;n++)await seedRecord(destination,housing,'/units','P13-UNIT-'+n,{programId:base.housingProgramId,code:'P13-UNIT-'+n,buildingId:base.buildingId,classification:'standard',availability:'available'});
 browser=await chromium.launch({headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});await authCookies(context);const page=await context.newPage();page.on('dialog',d=>d.accept());
 await page.goto(origin(source)+'/#/business/module/'+moduleId+'/participants');let view=page.getByTestId('module-screen-'+moduleId);await view.waitFor();
 if(!state.cases[0]){
  await view.getByLabel('Programme',{exact:true}).selectOption(program.id);await view.getByLabel('Referral source',{exact:true}).selectOption('partner-program');await view.getByLabel('Minimum synthetic assessment',{exact:true}).fill('Synthetic support need: stable housing, essential services and practical training; no identifying information.');
  const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/participants'));await view.getByRole('button',{name:'Create record',exact:true}).click();const result=await response;assert.equal(result.status(),201);state.cases[0]={participant:(await result.json()).record};await persist();pass('A synthetic intake was created using the module-provided browser form without identifying details');
 }
 for(let n=0;n<6;n++){
  if(!state.cases[n]){const reference=randomUUID(),p=await seedRecord(source,moduleId,'/participants',reference,{programId:program.id,reference,referralSource:'partner-program',assessmentSummary:'Synthetic support need for stable housing, essential services and training.'},{keyField:'reference'});state.cases[n]={participant:p};await persist();}
  const own=state.cases[n],priorProvider=own.referral?.provider?structuredClone(own.referral.provider):null;let participant=await find(source,moduleId,'/participants',own.participant.id);
  if(!participant.assessmentReviewedBy)participant=(await action(source,moduleId,'/review-assessment',participant)).record;
  if(participant.status==='intake'||participant.status==='assessed')participant=(await action(source,moduleId,'/enroll-participant',participant)).record;assert.equal(participant.status,'enrolled');own.participant=participant;
  let plan=await seedRecord(source,moduleId,'/plans','P13-PLAN-'+n,{programId:program.id,code:'P13-PLAN-'+n,participantRef:participant.participantRef,goal:'coordinated-support',summary:'Synthetic reviewed housing, food, training and employment support plan.',reviewDate:new Date(Date.now()+30*86400000).toISOString()});if(plan.status!=='approved')plan=(await action(source,moduleId,'/approve-plan',plan)).record;own.plan=plan;
  let referral=await seedRecord(source,moduleId,'/referrals','P13-HOUSING-'+n,{programId:program.id,code:'P13-HOUSING-'+n,participantRef:participant.participantRef,type:'housing',destinationEntityId:entityId(destination),destinationInstallationId:workerIdentity(destination).installationId,destinationModuleId:housing,destinationProgramId:base.housingProgramId,authority:'consented',authorityId:own.authorityId??(own.authorityId=randomUUID()),expiresAt:new Date(Date.now()+7*86400000).toISOString(),requestedStartsAt:new Date(Date.now()-1000).toISOString(),requestedEndsAt:new Date(Date.now()+45*86400000).toISOString(),classification:'standard',reviewReason:'Synthetic case-specific human authorization for minimum necessary housing disclosure.'});
  if(referral.status==='draft')referral=(await action(source,moduleId,'/review-referral',referral)).record;
  if(referral.status==='reviewed'){const requestId=randomUUID(),first=await action(source,moduleId,'/dispatch-referral',referral,{requestId}),repeat=await action(source,moduleId,'/dispatch-referral',referral,{requestId});assert.equal(first.commandId,repeat.commandId);referral=first.record;}
  referral=await waitFor(async()=>{const r=await find(source,moduleId,'/referrals',referral.id);return !r.deliveryPending&&r.providerStatus?r:null;},'signed housing referral receipt',90000);own.referral=referral;
  let placement=(await records(destination,housing,'/placements')).find(r=>r.referralId===referral.referralId);assert(placement);assert.equal(placement.participantAlias,referral.participantAlias);assert.notEqual(placement.participantAlias,participant.participantRef);
  const unit=(await records(destination,housing,'/units')).find(r=>r.code==='P13-UNIT-'+(n+1)&&r.programId===base.housingProgramId);assert(unit);
  if(!['confirmed','departed'].includes(placement.status)){
   let property=await find(destination,housing,'/properties',base.propertyId);await action(destination,housing,'/verify-property',property);await waitFor(async()=>{const r=await find(destination,housing,'/properties',base.propertyId);return r.authorityStatus==='verified'&&Date.parse(r.authority.validUntil)>Date.now()+15000?r:null;},'fresh canonical property authority');
   if(placement.status==='requested'){
    placement=(await moduleApi(destination,housing,'/placements/'+placement.id,'PUT',{programId:base.housingProgramId,code:placement.code,unitId:unit.id,reviewReason:'Synthetic substantive human suitability review of available standard unit and programme requirements.',revision:placement.revision})).record;
    placement=n===0?(await housingBrowserAction(page,placement,'reviewPlacement')).record:(await action(destination,housing,'/review-placement',placement)).record;
   }
   if(placement.status==='reviewed')placement=n===0?(await housingBrowserAction(page,placement,'approvePlacement')).record:(await action(destination,housing,'/approve-placement',placement)).record;
   if(placement.status==='approved')placement=n===0?(await housingBrowserAction(page,placement,'reservePlacement')).record:(await action(destination,housing,'/reserve-placement',placement)).record;
   if(placement.status==='reserved')placement=n===0?(await housingBrowserAction(page,placement,'confirmPlacement')).record:(await action(destination,housing,'/confirm-placement',placement)).record;
   if(n===0){report.housingBrowserApprovalVerified=true;await page.screenshot({path:'artifacts/phase13-housing-placement-approval-browser.png',fullPage:true});}
  }
  assert.equal(placement.status,'confirmed');own.placement=placement;
  if(!legacyConfirmed){await action(source,moduleId,'/refresh-referral',await find(source,moduleId,'/referrals',referral.id));own.referral=await waitFor(async()=>{const r=await find(source,moduleId,'/referrals',referral.id);return !r.deliveryPending&&r.providerStatus?.confirmed?r:null;},'actual housing confirmation returned to support programme');}
  else{assert.equal(referral.providerStatus.confirmed,true);assert.deepEqual(referral.provider,priorProvider);}
  const previous=(await records(destination,housing,'/followups')).find(r=>r.code==='P13-RETENTION-'+n&&r.placementId===placement.id);
  if(previous){assert.equal(previous.verificationStatus,'legacy-invalid-historical-basis');own.invalidHistoricalFollowup=previous;}
  const followup=await seedRecord(destination,housing,'/followups','P13-CHECKIN-'+n,{programId:base.housingProgramId,code:'P13-CHECKIN-'+n,placementId:placement.id,milestoneDays:0,observedAt:new Date().toISOString(),observation:'maintained',reason:'Synthetic immediate occupancy check-in; this does not establish 30-day retention.'});assert.equal(followup.milestoneDays,0);own.housingFollowup=followup;await persist();
 }
 pass('Six distinct synthetic cases have reviewed assessments, enrollment, approved plans, consent-scoped referrals and human-approved occupied units');
 pass('Immediate check-ins are separate from elapsed retention; invalid historical claims remain preserved and marked invalid');
 if(legacyConfirmed)pass('Original confirmed referral receipts retain their historical provider pins; no automatic package substitution or renewed cross-provider claim');
 const placements=(await records(destination,housing,'/placements')).filter(p=>p.programId===base.housingProgramId&&state.cases.some(c=>c.referral.referralId===p.referralId));assert.equal(placements.length,6);assert.equal(new Set(placements.map(p=>p.participantAlias)).size,6);pass('Safe same-request retries created six placements, not duplicate enrollments or occupancy effects');
 await page.goto(origin(source)+'/#/business/module/'+moduleId+'/referrals');view=page.getByTestId('module-screen-'+moduleId);await view.getByRole('cell',{name:'P13-HOUSING-0',exact:true}).waitFor();await page.screenshot({path:'artifacts/phase13-participant-referrals-browser.png',fullPage:true});
 const master=(await api('master','/api/v4/analytics')).value;assert(!JSON.stringify(master).includes(state.cases[0].participant.participantRef));assert(!JSON.stringify(master).includes(state.cases[0].referral.participantAlias));pass('General Master analytics contains neither source participant identity nor receiving housing alias');
 report.status='passed';report.caseCount=6;report.housingProgrammeId=base.housingProgramId;report.participantProgrammeId=program.id;report.privateStateFile='demo/phase13-participants.json';
}catch(e){report.status='failed';report.error=e.message;throw e;}finally{await browser?.close();await mkdir('artifacts',{recursive:true});await writeFile('artifacts/phase13-participant-deployment.json',JSON.stringify(report,null,2)+'\n');}
