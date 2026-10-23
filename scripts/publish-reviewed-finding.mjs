// Explicit presenter review action. The Analyst and MCP have no publication tool.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {directory} from './lib.mjs';
const id=process.argv[3],note=process.argv[4];
assert.match(id??'',/^[0-9a-f-]{36}$/i,'Provide the reviewed investigation UUID');assert(note&&note.length>=20&&note.length<=1000,'Provide an explicit review note after checking narrative against evidence');
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');process.env.STEWARD_DEMO_RETRY_LOGIN='1';
const {api,logins,sessions,origin,waitFor}=await import('./phase4-client.mjs');await logins();const run=(await api('master','/api/v5/analyst/investigations/'+id)).value;assert.equal(run.investigation.status,'completed');assert(run.investigation.result.analyses.length);
const report={verifiedAt:new Date().toISOString(),investigationId:id,testModel:run.investigation.test_model,reviewNote:note,reviewerAccountId:sessions.master.account.account_id,deliveries:[],browserErrors:[]};
const browser=await chromium.launch({headless:true});try{
 const context=await browser.newContext({ignoreHTTPSErrors:true});await context.addCookies([{name:'__Host-steward',value:sessions.master.cookie.split('=')[1],url:origin('master'),secure:true,httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage();page.on('pageerror',e=>report.browserErrors.push(e.message));await page.goto(origin('master'));await page.getByLabel('Investigation history',{exact:true}).selectOption(id);await page.getByTestId('analyst-evidence').waitFor();
 if(!run.investigation.finding_id){const response=page.waitForResponse(r=>r.url().endsWith('/'+id+'/finding')&&r.request().method()==='POST');await page.getByRole('button',{name:'Publish finding for human review',exact:true}).click();assert.equal((await response).status(),200);}
 await page.getByText('Published finding:',{exact:false}).waitFor();await page.locator('section[aria-label="AI Analyst"]').screenshot({path:'artifacts/phase7-reviewed-'+id+'.png'});
 const publication=(await api('master','/api/v5/analyst/investigations/'+id+'/finding','POST',{})).value;assert.equal(publication.findingId,id);report.findingId=publication.findingId;
 for(const worker of ['worker-1','worker-2','worker-3']){
  const entity=(await api(worker,'/api/v2/worker/status')).value.entityId,affected=run.investigation.result.analyses.some(a=>a.affectedEntities.includes(entity));
  const rows=affected?await waitFor(async()=>{const rows=(await api(worker,'/api/v4/findings')).value.findings;return rows.some(r=>r.finding_id===id)?rows:false;},'reviewed finding delivery '+worker):(await api(worker,'/api/v4/findings')).value.findings;
  const finding=rows.find(r=>r.finding_id===id);assert.equal(!!finding,affected);if(affected){assert(finding.payload.supportingReferences.every(r=>r.entityId===entity));if(finding.status!=='acknowledged')await api(worker,'/api/v4/findings/'+id,'PUT',{revision:finding.revision,status:'acknowledged'});await waitFor(async()=>(await api('master','/api/v4/findings')).value.receipts.some(r=>r.finding_id===id&&r.entity_id===entity&&r.status==='acknowledged'),'Worker finding acknowledgment '+worker);}
  report.deliveries.push({worker,entityId:entity,affected,received:!!finding,acknowledged:affected});
 }
 assert.deepEqual(report.browserErrors,[]);report.status='passed';console.log('PASS separately reviewed browser publication, idempotent finding, affected-only delivery and durable Worker acknowledgments: '+id);
}catch(error){report.status='failed';report.failure=error.message;throw error;}
finally{await browser.close();const base=path.join(directory,'phase7/reviews');await mkdir(base,{recursive:true,mode:0o700});await writeFile(path.join(base,id+'.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});await writeFile('artifacts/phase7-reviewed-'+id+'.json',JSON.stringify(report,null,2)+'\n');}
