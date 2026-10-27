// Re-exercise a completed real investigation after a browser assertion failure.
// Never rerun the model, change results, publish, or waive source authorization.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {api,logins} from './phase13-acceptance-client.mjs';
import {analystBrowserSession} from './analyst-browser-session.mjs';
const file=process.env.STEWARD_OLLAMA_REVIEW_REPORT??'artifacts/phase14-economic-cost-ollama.json',report=JSON.parse(await readFile(file,'utf8'));
assert.equal(report.status,'failed');assert.equal(report.investigationStatus,'completed');
assert.equal(report.testModel,false);assert.equal(report.error,null);assert(report.configurationRestored&&report.modelUnloaded);
assert(report.failure.includes('analyst-evidence'),'Only the captured browser-evidence assertion is recoverable here');
await logins();const retained=(await api('master','/api/v5/analyst/investigations/'+report.investigationId)).value.investigation;
assert.equal(retained.status,'completed');assert.equal(retained.test_model,false);assert.deepEqual(retained.result,report.result);assert.equal(retained.finding_id,null);
const browser=await analystBrowserSession();
try{
 await browser.verify(report);
 report.recoveredFailures=[...(report.recoveredFailures??[]),{failure:report.failure,resolvedAt:new Date().toISOString(),verification:'Current authenticated source-authorized retained result matches; Chromium renders complete narrative with normalized display whitespace and resets review across selection.'}];
 delete report.failure;report.status='passed_pending_narrative_review';
}finally{await browser.close();await writeFile(file,JSON.stringify(report,null,2)+'\n');console.log('Completed-investigation browser recovery: '+report.status);}
