// Continue the existing six-case pathway through actual approved local SSMA.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {api,logins,origin,sessions,waitFor,directory,moduleApi,installed,records,seedRecord,action,sectionState,ensurePeerWorkflow,entityId,workerIdentity} from './phase13-acceptance-client.mjs';
const worker='worker-3',support='steward.housing.services',food='steward.services.food';
const {state,persist}=await sectionState('participant-food');state.cases??=[];
const participants=JSON.parse(await readFile(path.join(directory,'demo/phase13-participants.json'),'utf8'));
const foodState=JSON.parse(await readFile(path.join(directory,'demo/phase13-food.json'),'utf8'));
const report={verifiedAt:new Date().toISOString(),syntheticOnly:true,checks:[]};let browser;
const pass=s=>{report.checks.push(s);console.log('PASS '+s);};
const find=async(m,url,id)=>(await records(worker,m,url)).find(r=>r.id===id);
async function screen(page,id,screenId){const contribution=(await installed(worker,id)).manifest.ui.find(s=>s.screenId===screenId);assert(contribution);await page.goto(origin(worker)+'/#/business/module/'+id+'/'+screenId);await page.reload();const view=page.getByTestId('module-screen-'+id);await view.waitFor();return{view,contribution};}
async function browserAction(page,id,screenId,row,operationId){const{view,contribution}=await screen(page,id,screenId),operation=contribution.actions.find(a=>a.operationId===operationId);assert(operation);const reference=row.code,label=/^[a-f0-9-]{36}$/i.test(reference)?'Reference · '+reference.slice(-8):reference;const tr=view.getByRole('row').filter({has:view.getByText(label,{exact:true})});const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/'+row.id));await tr.getByRole('button',{name:operation.label,exact:true}).click();const r=await response;assert.equal(r.status(),200,await r.text());return r.json();}
try{
 await logins();assert.equal(participants.cases.length,6);assert(foodState.foodProgramId&&foodState.localDeliveryId);
 assert.equal((await installed(worker,support)).version,'1.0.1');assert.equal((await installed(worker,food)).version,'1.0.0');
 const programmeId=foodState.foodProgramId,expiresAt=new Date(Date.now()+7*86400000).toISOString();
 let relationship=await seedRecord(worker,food,'/service-sources','P13-SUPPORT-FOOD',{programId:programmeId,code:'P13-SUPPORT-FOOD',sourceProgramId:participants.programId,sourceEntityId:entityId(worker),sourceInstallationId:workerIdentity(worker).installationId,sourceModuleId:support,expiresAt,reason:'Synthetic reviewed programme-specific minimum necessary Food service sharing basis.'});
 if(relationship.status==='draft')relationship=(await action(worker,food,'/approve-source',relationship)).record;
 await ensurePeerWorkflow({section:'participant-food',key:'food-v1',source:worker,destination:worker,consumerId:support,providerId:food,sourceProgramId:participants.programId,destinationProgramId:programmeId,capabilityId:'food.service',operations:['food.referral.request','food.referral.status','food.referral.withdraw','food.capacity.observe'],purpose:'food.service',authorityReference:relationship.id});
 let destination=await seedRecord(worker,support,'/service-destinations','P13-FOOD-DESTINATION',{programId:participants.programId,code:'P13-FOOD-DESTINATION',name:'Synthetic approved Food Services',type:'food',destinationEntityId:entityId(worker),destinationInstallationId:workerIdentity(worker).installationId,destinationModuleId:food,destinationProgramId:programmeId,expiresAt,reason:'Human-reviewed local service programme destination; no unrestricted case sharing.'});
 if(destination.status==='draft')destination=(await action(worker,support,'/approve-service-destination',destination)).record;
 browser=await chromium.launch({headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}),cookie=sessions[worker].cookie,at=cookie.indexOf('=');await context.addCookies([{name:cookie.slice(0,at),value:cookie.slice(at+1),url:origin(worker),secure:true,httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage();page.on('dialog',d=>d.accept());
 for(let n=0;n<6;n++){
  const participant=participants.cases[n].participant;state.cases[n]??={authorityId:randomUUID()};const own=state.cases[n];
  let referral=await seedRecord(worker,support,'/referrals','P13-FOOD-'+n,{programId:participants.programId,code:'P13-FOOD-'+n,participantRef:participant.participantRef,type:'food',destinationId:destination.id,authority:'consented',authorityId:own.authorityId,expiresAt,reviewReason:'Synthetic case-specific human authorization for minimum necessary food service referral.'});
  if(referral.status==='draft')referral=n===0?(await browserAction(page,support,'referrals',referral,'reviewReferral')).record:(await action(worker,support,'/review-referral',referral)).record;
  if(referral.status==='reviewed')referral=n===0?(await browserAction(page,support,'referrals',referral,'dispatchReferral')).record:(await action(worker,support,'/dispatch-referral',referral)).record;
  referral=await waitFor(async()=>{const r=await find(support,'/referrals',referral.id);return !r.deliveryPending&&r.providerStatus?r:null;},'actual local SSMA Food receipt',120000);own.referralId=referral.id;
  let received=(await records(worker,food,'/referrals')).find(r=>r.referralId===referral.referralId);assert(received);assert.notEqual(received.participantAlias,participant.participantRef);assert.equal(received.sourceProgramId,participants.programId);
  if(received.status!=='delivered'){
   received=(await moduleApi(worker,food,'/referrals/'+received.id,'PUT',{programId:programmeId,code:received.code,reviewReason:'Synthetic substantive human service review and allocation of a recorded meal delivery.',deliveryId:foodState.localDeliveryId,revision:received.revision})).record;
   if(received.status==='requested')received=n===0?(await browserAction(page,food,'referral',received,'acceptReferral')).record:(await action(worker,food,'/accept-referral',received)).record;
   if(received.status==='accepted')received=n===0?(await browserAction(page,food,'referral',received,'deliverReferral')).record:(await action(worker,food,'/deliver-referral',received)).record;
  }
  assert.equal(received.status,'delivered');own.receivingReferralId=received.id;
  await action(worker,support,'/refresh-referral',await find(support,'/referrals',referral.id));await waitFor(async()=>{const r=await find(support,'/referrals',referral.id);return !r.deliveryPending&&r.providerStatus?.status==='delivered';},'delivered Food status returned through governed local SSMA',120000);
  own.followup=(await seedRecord(worker,support,'/followups','P13-SUPPORT-CHECKIN-'+n,{programId:participants.programId,code:'P13-SUPPORT-CHECKIN-'+n,participantRef:participant.participantRef,type:'completed',observedAt:new Date().toISOString(),summary:'Synthetic immediate coordinated support check-in; not an elapsed housing or employment retention claim.'})).id;await persist();
 }
 pass('Six existing synthetic participants received distinct approved Food referrals and human-reviewed delivery acknowledgments through local SSMA');
 const received=(await records(worker,food,'/referrals')).filter(r=>state.cases.some(c=>c.receivingReferralId===r.id));assert.equal(received.length,6);assert.equal(new Set(received.map(r=>r.participantAlias)).size,6);assert.equal((await find(food,'/deliveries',foodState.localDeliveryId)).quantity,6);
 pass('Six recipient allocations reconcile to the existing six-meal delivery without duplicate stock consumption');
 await screen(page,food,'referral');await page.screenshot({path:'artifacts/phase13-participant-food-browser.png',fullPage:true});
 const general=JSON.stringify((await api('master','/api/v4/analytics')).value);for(const c of participants.cases)assert(!general.includes(c.participant.participantRef));for(const r of received)assert(!general.includes(r.participantAlias));pass('General Master analytics contains neither source participant identifiers nor Food service aliases');
 report.status='passed';report.caseCount=6;
}catch(e){report.status='failed';report.error=e.message;throw e;}finally{await browser?.close();await writeFile('artifacts/phase13-participant-food-deployment.json',JSON.stringify(report,null,2)+'\n');}
