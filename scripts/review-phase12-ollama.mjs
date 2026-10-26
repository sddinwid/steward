// Run only after separately reading the actual model narrative and retained evidence.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {directory} from './lib.mjs';
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');process.env.STEWARD_DEMO_RETRY_LOGIN??='1';
const {api,logins,waitFor,credentials}=await import('./phase4-client.mjs');
const reportFile='artifacts/phase12-ollama-provider.json',report=JSON.parse(await readFile(reportFile,'utf8'));
assert.equal(report.status,'passed_pending_narrative_review');assert.equal(process.env.STEWARD_REVIEWED_INVESTIGATION_ID,report.investigationId,'Explicitly identify the independently reviewed model investigation');assert(report.configurationRestored&&report.modelUnloaded);await logins();
const live=(await api('master','/api/v5/analyst/investigations/'+report.investigationId)).value;assert.equal(live.investigation.status,'completed');assert.equal(live.investigation.test_model,false);assert.deepEqual(live.investigation.result,report.result);
const browser=await(await import('./analyst-browser-session.mjs')).analystBrowserSession();
try{
 report.findingId=(await browser.publish(report.investigationId)).value.findingId;assert(report.findingId);report.deliveries=[];
 for(const worker of ['worker-1','worker-2','worker-3']){const entityId=(await api(worker,'/api/v2/worker/status')).value.entityId,affected=report.result.analyses.some(a=>a.affectedEntities.includes(entityId));const rows=affected?await waitFor(async()=>{const fs=(await api(worker,'/api/v4/findings')).value.findings;return fs.some(f=>f.finding_id===report.findingId)?fs:false;},'reviewed model finding '+worker):(await api(worker,'/api/v4/findings')).value.findings;assert.equal(rows.some(f=>f.finding_id===report.findingId),affected);report.deliveries.push({worker,affected,received:affected});}
 await browser.verify(report);await waitFor(async()=>{const receipts=(await api('master','/api/v4/findings')).value.receipts.filter(r=>r.finding_id===report.findingId&&r.status==='acknowledged');return new Set(receipts.map(r=>r.entity_id)).size===2;},'both model finding acknowledgments on Master');
 report.checks.push('separate narrative/source review followed by browser publication, affected-only delivery and both acknowledgments returned to Master');report.reviewedAt=new Date().toISOString();report.status='passed';console.log('PASS reviewed real Qwen scientific finding, actual browser publication and affected-only acknowledged delivery.');
}catch(e){report.publicationFailure=Object.values(credentials.accounts).reduce((s,a)=>a?.password?s.replaceAll(a.password,'[REDACTED]'):s,String(e.message));process.exitCode=1;console.log(report.publicationFailure);}finally{await browser.close();await writeFile(reportFile,JSON.stringify(report,null,2)+'\n');}
