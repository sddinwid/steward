import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {login,credentials,sessions,origin} from './phase4-client.mjs';
const live=JSON.parse(await readFile('artifacts/phase5-ollama-provider.json','utf8'));
assert.equal(live.investigationStatus,'completed');assert.equal(live.testModel,false);assert.ok(live.findingId);
await login('master',credentials.accounts.registry);const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({ignoreHTTPSErrors:true});await context.addCookies([{name:'__Host-steward',value:sessions.master.cookie.split('=')[1],url:origin('master'),secure:true,httpOnly:true,sameSite:'Strict'}]);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin('master'));
 await page.getByLabel('Investigation history').selectOption(live.investigationId);await page.getByTestId('analyst-evidence').waitFor();
 const workspace=page.locator('section[aria-label="AI Analyst"]'),text=await workspace.innerText();assert.ok(text.includes(live.result.narrative));assert.ok(text.includes('ollama:'));assert.ok(text.includes(live.findingId));
 for(const analysis of live.result.analyses){assert.ok(text.includes(String(analysis.calculation.proposal.ecosystemMonthlyBenefit)));assert.ok(text.includes(analysis.observed.supplyWorker));assert.ok(text.includes(analysis.observed.demandWorker));}
 assert.equal(await workspace.getByText('TEST MODEL: validation result, not a live AI provider.',{exact:true}).count(),0);
 await workspace.getByRole('heading',{name:'Observed source data',exact:true}).first().waitFor();await workspace.getByRole('heading',{name:'Explicit calculation assumptions',exact:true}).first().waitFor();await workspace.getByText('Model wording about assumptions (non-authoritative)',{exact:true}).waitFor();
 await workspace.screenshot({path:'artifacts/phase5b-live-analyst.png'});
 const partial=JSON.parse(await readFile('artifacts/phase5b-first-attempt.json','utf8'));await page.getByLabel('Investigation history').selectOption(partial.investigationId);await workspace.getByText('Partial investigation: no final recommendation.',{exact:true}).waitFor();
 await workspace.screenshot({path:'artifacts/phase5b-partial-analyst.png'});assert.deepEqual(errors,[]);
 await writeFile('artifacts/phase5b-live-browser.json',JSON.stringify({verifiedAt:new Date().toISOString(),liveInvestigationId:live.investigationId,partialInvestigationId:partial.investigationId,checks:['persisted real-model attribution','narrative, deterministic figures and source Workers visible','published finding identity visible','partial run clearly reports no final recommendation','no JavaScript errors'],browserErrors:errors},null,2)+'\n');
 console.log('PASS Chromium real-model narrative, calculation/source evidence, finding identity and explicit partial-investigation display');
}finally{await browser.close();}
