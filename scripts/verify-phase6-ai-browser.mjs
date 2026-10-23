import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {directory} from './lib.mjs';
process.env.STEWARD_SEED_CREDENTIALS_FILE=path.join(directory,'demo/presenter.json');
process.env.STEWARD_DEMO_RETRY_LOGIN='1';
const {api,logins,sessions,origin}=await import('./phase4-client.mjs');
const live=JSON.parse(await readFile(path.join(directory,'demo/live-ai.json'),'utf8'));
assert.equal(live.investigationStatus,'completed');assert.equal(live.testModel,false);assert.ok(live.findingId);await logins();
const browser=await chromium.launch({headless:true}),errors=[];
try{
 const context=await browser.newContext({ignoreHTTPSErrors:true});
 for(const key of ['master',...live.deliveries.filter(d=>d.affected).map(d=>d.worker)]){
  await context.addCookies([{name:'__Host-steward',value:sessions[key].cookie.split('=')[1],url:origin(key),secure:true,httpOnly:true,sameSite:'Strict'}]);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin(key));
  if(key==='master'){
   await page.getByLabel('Investigation history').selectOption(live.investigationId);await page.getByTestId('analyst-evidence').waitFor();
   const workspace=page.locator('section[aria-label="AI Analyst"]'),text=await workspace.innerText();
   assert.ok(text.includes(live.result.narrative));assert.ok(text.includes('ollama:'));assert.equal(await workspace.getByText('TEST MODEL: validation result, not a live AI provider.',{exact:true}).count(),0);
   for(const analysis of live.result.analyses){assert.ok(text.includes(String(analysis.calculation.proposal.ecosystemMonthlyBenefit)));assert.ok(text.includes(analysis.observed.supplyWorker));assert.ok(text.includes(analysis.observed.demandWorker));}
   await workspace.getByRole('heading',{name:'Observed source data',exact:true}).first().waitFor();await workspace.getByRole('heading',{name:'Explicit calculation assumptions',exact:true}).first().waitFor();
   await workspace.screenshot({path:'artifacts/phase6-real-ai.png'});
  }else{
   const finding=page.getByTestId('finding-'+live.findingId);await finding.waitFor();await finding.getByText('Master status: open · Local status: acknowledged',{exact:true}).waitFor();await finding.screenshot({path:'artifacts/phase6-'+key+'-finding.png'});
   const actual=(await api(key,'/api/v4/findings')).value.findings.find(f=>f.finding_id===live.findingId);assert.equal(actual.status,'acknowledged');
  }
 }
 assert.deepEqual(errors,[]);await writeFile('artifacts/phase6-ai-browser.json',JSON.stringify({verifiedAt:new Date().toISOString(),investigationId:live.investigationId,testModel:false,evidenceAndCalculationsVisible:true,affectedWorkersAcknowledged:true,browserErrors:errors},null,2)+'\n');
 console.log('PASS Chromium real-model narrative, MCP evidence, deterministic calculations, source identities and affected-Worker finding acknowledgment.');
}finally{await browser.close();}
