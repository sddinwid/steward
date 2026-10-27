// Real module UI reserve rejection. No authorization, receipt or settlement created.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {state,persist,actors,request,report as setup} from './seed-phase14-economy.mjs';
import {records,waitFor,compose} from './phase13-acceptance-client.mjs';
import {execFileSync} from 'node:child_process';
import {digest} from '../packages/module-sdk/dist/index.js';
import {financialBrowser} from './financial-browser-client.mjs';
assert.equal(setup.status,'passed');const coord='steward.finance.resource-coordination',resource='steward.finance.resource-availability',r=state.coordination.food,w=r.source;
const report={startedAt:new Date().toISOString(),status:'in-progress',syntheticOnly:true,browserErrors:[]};let ui;
const journal=()=>execFileSync('docker',['exec',compose('ps','-q',w+'-db'),'psql','-U','postgres','-d','m_'+digest(resource).slice(0,20),'-At','-v','ON_ERROR_STOP=1','-c',"SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM resource_holds t"],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
try{
 const before=journal(),availability=(await request(w,resource,'/availability-overview')).records.find(v=>v.programId===state.resources[w].programId);assert(availability.potentiallyAvailableCents>0);
 ui=await financialBrowser(actors,report);let c=state.reserveRejection?.id?(await records(w,coord,'/commitments')).find(v=>v.id===state.reserveRejection.id):null;
 if(!c){c=await ui.create(w,coord,'commitment',{programId:r.sourceProgramme.programId,policyId:r.sourceProgramme.policyId,resourceProfileId:r.resourceProfileId,recipientId:r.recipientId,amountCents:availability.potentiallyAvailableCents+10000,quantity:0,expiresAt:new Date(Date.now()+3600000).toISOString(),purpose:'Synthetic reserve rejection: exceeds independently protected available cash; never execute.'});state.reserveRejection={id:c.id,code:c.code};await persist();}
 if(c.status==='proposed')await ui.action(w,coord,'commitment',c,'reserveContribution');
 c=await waitFor(async()=>{const v=(await records(w,coord,'/commitments')).find(v=>v.id===c.id);return v?.status==='reservation-unavailable'?v:false;},'source provider rejects over-reserve proposal',120000);
 assert(c.lastFailure);assert(!c.contributorApproved&&!c.settlementId);assert.equal(journal(),before,'Rejected request creates no source resource hold');assert.equal((await request(w,resource,'/availability-overview')).records.find(v=>v.programId===availability.programId).potentiallyAvailableCents,availability.potentiallyAvailableCents);
 const {page,view}=await ui.open(w,coord,'coordination-overview');await ui.rowFor(view,c).getByText(c.lastFailure,{exact:false}).first().waitFor();await page.screenshot({path:'artifacts/phase14-reserve-rejection-browser.png',fullPage:true});report.rejected={id:c.id,status:c.status,error:c.lastFailure,amountCents:c.amountCents,availableCents:availability.potentiallyAvailableCents};assert.deepEqual(report.browserErrors,[]);report.status='passed';
}catch(e){report.status='failed';report.error=e.stack;process.exitCode=1;console.error(e.message);}finally{await ui?.close();report.finishedAt=new Date().toISOString();await writeFile('artifacts/phase14-reserve-rejection.json',JSON.stringify(report,null,2)+'\n');console.log('Actual reserve rejection: '+report.status);}
