// Actual original-provider equipment sharing, bilateral return, Master outage and restart.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {digest} from '../packages/module-sdk/dist/index.js';
import {state,persist,actors,request,act,report as setup} from './seed-phase14-economy.mjs';
import {api,records,seedRecord,waitFor,compose,deployment,workerIdentity,entityId} from './phase13-acceptance-client.mjs';
import {financialBrowser} from './financial-browser-client.mjs';
assert.equal(setup.status,'passed');assert.equal(Object.keys(state.contributions??{}).length,3);
const resource='steward.finance.resource-availability',coord='steward.finance.resource-coordination',r=state.coordination.training,w=r.source,d=r.destination;
const report={startedAt:new Date().toISOString(),status:'in-progress',syntheticOnly:true,browserErrors:[],actions:[],masterRestored:false};let ui,masterStopped=false;
const get=async(worker,path,id)=>(await records(worker,coord,path)).find(v=>v.id===id),until=(worker,path,id,status)=>waitFor(async()=>{const v=await get(worker,path,id);if(v?.lastFailure)throw Error(v.lastFailure);return v?.status===status?v:false;},'original noncash workflow '+status,120000);
const query=(worker,id,sql)=>execFileSync('docker',['exec',compose('ps','-q',worker+'-db'),'psql','-U','postgres','-d','m_'+digest(id).slice(0,20),'-At','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
async function health(key){const i=deployment.instances.find(i=>i.key===key),response=await fetch('http://127.0.0.1:'+i.apiPort+'/ready',{signal:AbortSignal.timeout(4000)});assert.equal(response.status,200);assert.equal((await response.json()).status,'ready');return true;}
try{
 state.sharedResource??={createdAt:new Date().toISOString()};const s=state.sharedResource,owner=state.resources[w];
 const equipment=await seedRecord(w,resource,'/noncash-resources','P14-SHARED-WORKSTATIONS',{programId:owner.programId,code:'P14-SHARED-WORKSTATIONS',name:'Synthetic shared training workstations',resourceKind:'equipment',capacityMode:'reusable',quantity:5,operationalPriorityQuantity:1,unit:'workstations',restriction:'program',availableFrom:s.createdAt,availableUntil:new Date(Date.parse(s.createdAt)+60*86400000).toISOString(),valuationCents:0,valuationKnown:'unknown',valuationBasis:'unknown',operatingCostCents:0,evidence:'Synthetic owner-observed reusable workstations; one protected for local operations; valuation remains unknown and creates no funding.'});s.resourceId=equipment.id;
 const profile=await seedRecord(w,coord,'/resource-profiles','P14-WORKSTATIONS-ROUTE',{programId:r.sourceProgramme.programId,code:'P14-WORKSTATIONS-ROUTE',name:'Original owner workstation sharing',resourceProgramId:owner.programId,assessmentId:owner.assessmentId,resourcePolicyVersion:owner.policyVersion,resourceKind:'equipment',capacityMode:'reusable',resourceId:equipment.id,unit:'workstations',valuationKnown:'unknown',unitValuationCents:0,valuationBasis:'unknown',unitOperatingCostCents:0,restriction:'program'});s.profileId=profile.id;await persist();
 ui=await financialBrowser(actors,report);let c=s.commitmentId?await get(w,'/commitments',s.commitmentId):null;
 if(!c){c=await ui.create(w,coord,'commitment',{programId:r.sourceProgramme.programId,policyId:r.sourceProgramme.policyId,resourceProfileId:profile.id,recipientId:r.recipientId,amountCents:0,quantity:2,expiresAt:new Date(Date.now()+3600000).toISOString(),purpose:'Synthetic temporary training workstation use; original owner retains authority; unknown valuation is not money.'});s.commitmentId=c.id;await persist();}
 const original={id:c.id,termsDigest:c.termsDigest,resourceId:equipment.id,sourceInstallationId:workerIdentity(w).installationId,receiverInstallationId:workerIdentity(d).installationId};
 compose('stop','master-api','master-web');masterStopped=true;await assert.rejects(()=>health('master'));report.masterUnavailableVerified=true;for(const key of['worker-1','worker-2','worker-3'])await health(key);
 if(c.status==='proposed'){await ui.action(w,coord,'commitment',c,'reserveContribution');c=await until(w,'/commitments',c.id,'reserved');}
 if(c.status==='reserved')c=(await ui.action(w,coord,'commitment',c,'approveContribution',true)).record;
 if(c.status==='contributor-approved')await ui.action(w,coord,'commitment',c,'submitContribution');
 let incoming=await waitFor(async()=>(await records(d,coord,'/incoming-contributions')).find(v=>v.terms.commitmentId===c.terms.commitmentId),'original noncash remote proposal',120000);
 if(incoming.status==='proposed')incoming=(await ui.action(d,coord,'incoming-contribution',incoming,'acceptContribution',true)).record;
 c=await get(w,'/commitments',c.id);
 if(!['resource-delivered','resource-in-use','return-observed','reconciled'].includes(c.status)){
  if(c.status!=='receiver-accepted'){await ui.action(w,coord,'commitment',c,'refreshContribution');c=await until(w,'/commitments',c.id,'receiver-accepted');}
  await ui.action(w,coord,'commitment',c,'authorizeResourceUse',true);c=await until(w,'/commitments',c.id,'resource-delivered');
 }
 incoming=await get(d,'/incoming-contributions',incoming.id);if(incoming.status==='accepted'){await ui.action(w,coord,'commitment',c,'announceResourceDelivery');incoming=await until(d,'/incoming-contributions',incoming.id,'delivery-observed');}
 if(incoming.status==='delivery-observed')incoming=(await ui.action(d,coord,'incoming-contribution',incoming,'confirmResourceDelivery',true)).record;
 if(incoming.status==='delivered'){c=await get(w,'/commitments',c.id);await ui.action(w,coord,'commitment',c,'refreshContribution');c=await until(w,'/commitments',c.id,'resource-in-use');await ui.action(d,coord,'incoming-contribution',incoming,'recordResourceReturn',true);incoming=await until(d,'/incoming-contributions',incoming.id,'returned');}
 c=await get(w,'/commitments',c.id);if(c.status!=='reconciled'){if(c.status!=='return-observed'){await ui.action(w,coord,'commitment',c,'refreshContribution');c=await until(w,'/commitments',c.id,'return-observed');}await ui.action(w,coord,'commitment',c,'confirmResourceReturn',true);c=await until(w,'/commitments',c.id,'reconciled');}
 assert.equal(c.terms.valuationCents,null);assert.equal(c.amountCents,0);assert.equal(c.termsDigest,original.termsDigest);assert(c.deliveryId);s.deliveryId=c.deliveryId;s.incomingId=incoming.id;await persist();report.originalResource={...original,deliveryId:c.deliveryId,status:c.status,valuationCents:null,cashCreatedCents:0};
 const cashBefore=(await request(w,resource,'/availability-overview')).records.find(v=>v.programId===owner.programId);assert.equal(cashBefore.potentiallyAvailableCents,1300000);
 compose('restart','worker-1-api','worker-2-api','worker-3-api');for(const key of['worker-1','worker-2','worker-3'])await waitFor(async()=>{try{return await health(key);}catch{return false;}},'Worker ready without Master after restart',120000);
 const retained=await get(w,'/commitments',c.id);assert.equal(retained.status,'reconciled');assert.equal(retained.deliveryId,s.deliveryId);assert.equal(retained.termsDigest,original.termsDigest);assert.equal(retained.terms.sourceInstallationId,workerIdentity(w).installationId);report.workerRestartPreservedOriginalObligation=true;
 assert.equal(Number(query(w,coord,'SELECT count(*) FROM synthetic_settlements')),2);assert.equal(Number(query(d,coord,'SELECT count(*) FROM synthetic_settlements')),1);assert.equal(query(w,resource,"SELECT state FROM resource_holds WHERE commitment_id='"+c.terms.commitmentId+"'"),'returned');report.noAdditionalCashSettlement=true;
 let disclosure=await seedRecord(w,resource,'/economic-disclosure-requests','P14-OFFLINE-RESOURCE-SNAPSHOT',{programId:owner.programId,code:'P14-OFFLINE-RESOURCE-SNAPSHOT',policyId:owner.policyId,sourceRecordId:owner.assessmentId});if(disclosure.status!=='published'){disclosure=await act(w,resource,'review-economic-summary',disclosure,true);disclosure=await act(w,resource,'publish-economic-summary',disclosure,true);}s.offlineSummaryId=disclosure.id;await persist();
 assert(Number(query(w,resource,"SELECT count(*) FROM sync_outbox WHERE acknowledged_at IS NULL AND envelope->>'streamId'='economic_summaries_v1' AND envelope->>'recordId'='"+disclosure.id+"'"))>0);report.durableOfflineSummaryQueued=true;
 await(ui.open(d,coord,'incoming-contribution',true)).then(v=>v.page.screenshot({path:'artifacts/phase14-shared-resource-return-browser.png',fullPage:true}));assert.deepEqual(report.browserErrors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;console.error(error.message);}finally{
 if(masterStopped){try{compose('up','-d','--no-build','--wait','master-api','master-web');await health('master');report.masterRestored=true;if(state.sharedResource?.offlineSummaryId){await waitFor(async()=>(await api('master','/api/v14/economy/summaries?limit=20')).value.records.some(r=>r.reference.recordId===state.sharedResource.offlineSummaryId&&r.current),'durable offline resource projection reaches Master',120000);report.durableSummaryRecovered=true;}}catch(error){report.status='failed';report.recoveryError=error.message;process.exitCode=1;}}
 await ui?.close();try{execFileSync(process.execPath,['scripts/verify-single-stack.mjs'],{stdio:'inherit'});}catch{report.status='failed';process.exitCode=1;}report.finishedAt=new Date().toISOString();await writeFile('artifacts/phase14-shared-resource-outage.json',JSON.stringify(report,null,2)+'\n');console.log('Shared resource/outage acceptance: '+report.status);
}
