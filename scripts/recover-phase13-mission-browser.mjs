// Reverify an EXISTING completed investigation after the presentation fix.
// No inference, model configuration, grants, finding publication or ACK writes.
// node scripts/recover-phase13-mission-browser.mjs <selected-directory>
import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
assert(process.argv[2],'Selected deployment directory required');
const selection=JSON.parse(await readFile('.steward/operator/selection.json','utf8'));
assert.equal(path.resolve(process.argv[2]),path.resolve(selection.directory));
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(path.resolve(process.argv[2]),'demo/presenter.json');
const reportFile='artifacts/phase13-mission-ollama.json',report=JSON.parse(await readFile(reportFile,'utf8'));
assert.equal(report.capability,'mission-sustainability');assert.equal(report.investigationId,'fff6d56b-63d8-47fa-9c30-feaa89c10da9','Recovery is pinned to the actually completed investigation; review a different run explicitly');assert.equal(report.investigationStatus,'completed');assert(report.result);assert(!report.findingId,'This recovery must not publish or alter an existing finding');assert(report.configurationRestored&&report.modelUnloaded,'Original live-provider cleanup must already have succeeded');
const originalFailure=report.failure,backup='artifacts/phase13-mission-ollama-before-browser-recovery-'+Date.now()+'.json';await copyFile(reportFile,backup);
const {api,login,credentials}=await import('./phase4-client.mjs');let browser;
try{
 await login('master',credentials.accounts.registry);const actual=(await api('master','/api/v5/analyst/investigations/'+report.investigationId)).value;
 assert.equal(actual.investigation.status,'completed');assert.equal(actual.investigation.finding_id,null);assert.deepEqual(actual.investigation.result,report.result,'Retained completed result must match the verified original report');
 browser=await(await import('./analyst-browser-session.mjs')).analystBrowserSession();await browser.verify(report);
 assert(report.browser.historyRefresh&&!report.browser.publishedThroughUI);report.browser.sameCompletedInvestigationRecovered=true;report.browser.noAdditionalInference=true;report.browser.originalFailure=originalFailure;report.browser.originalFailureEvidence=backup;report.browser.recoveredAt=new Date().toISOString();
 report.checks.push('Same completed real-Qwen investigation verified through ordinary authenticated browser history and reload; no further inference or finding publication.');delete report.failure;delete report.browserFailure;report.status='passed_pending_narrative_review';
 console.log('PASS browser recovery of same completed mission investigation; no inference or publication.');
}catch(error){report.browserRecoveryFailure=error.message;process.exitCode=1;console.log('Browser recovery failed; original failed evidence preserved.');}
finally{await browser?.close();await writeFile(reportFile,JSON.stringify(report,null,2)+'\n');}
