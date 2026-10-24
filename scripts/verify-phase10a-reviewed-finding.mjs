// Synthetic acceptance: publish only the exact real-model narrative already reviewed by the operator.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';
import {directory} from './lib.mjs';
import {calculateCommerce} from '../packages/platform/dist/commerce-analysis.js';
assert.equal(JSON.parse(await readFile(path.join(directory,'commerce/manifest.json'),'utf8')).simulators,true);
const provider=JSON.parse(await readFile(process.env.STEWARD_OLLAMA_REPORT??'artifacts/phase10a-ollama.json','utf8'));
assert.equal(provider.status,'passed_pending_narrative_review');assert.equal(provider.testModel,false);
const narrativeHash=createHash('sha256').update(provider.result.narrative).digest('hex');
assert.equal(process.env.STEWARD_REVIEWED_NARRATIVE_SHA256,narrativeHash,'Review actual narrative/calculations, then explicitly supply its SHA-256; no automatic semantic approval');
for(const analysis of provider.result.analyses)assert.deepEqual(analysis.calculation,calculateCommerce(analysis.observed.sources.map(s=>s.payload.projection)));
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');process.env.STEWARD_DEMO_RETRY_LOGIN='1';
const {api,logins,sessions,origin,waitFor}=await import('./phase4-client.mjs');
const report={startedAt:new Date().toISOString(),simulation:true,testModel:false,investigationId:provider.investigationId,narrativeHash,narrativeReview:'Accepted against actual fee-aware source calculations; estimated contribution is not verified profit; consequential decisions remain human review.',deliveries:[],browserErrors:[],checks:[]};
const browser=await chromium.launch({headless:true});
async function pageFor(key){const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});await context.addCookies([{name:'__Host-steward',value:sessions[key].cookie.split('=')[1],url:origin(key),secure:true,httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.browserErrors.push(e.message));return page;}
try{
 await logins();const page=await pageFor('master');await page.goto(origin('master')+'/#/business/history/'+provider.investigationId);await page.getByTestId('analyst-evidence').waitFor();assert((await page.locator('section[aria-label="AI Analyst"]').innerText()).includes(provider.result.narrative));await page.reload();await page.getByTestId('analyst-evidence').waitFor();await page.getByRole('heading',{name:'AI-generated narrative - review against evidence',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/phase10a-real-analyst.png',fullPage:false});
 const run=(await api('master','/api/v5/analyst/investigations/'+provider.investigationId)).value.investigation;
 if(!run.finding_id){const response=page.waitForResponse(r=>r.url().endsWith('/'+provider.investigationId+'/finding')&&r.request().method()==='POST');await page.getByRole('button',{name:'Publish finding for human review',exact:true}).click();const result=await response;assert.equal(result.status(),200);report.findingId=(await result.json()).findingId;}else report.findingId=run.finding_id;
 for(const worker of ['worker-1','worker-2','worker-3']){
  const entityId=(await api(worker,'/api/v2/worker/status')).value.entityId,affected=provider.result.analyses.some(a=>a.affectedEntities.includes(entityId));
  const rows=affected?await waitFor(async()=>{const rows=(await api(worker,'/api/v4/findings')).value.findings;return rows.some(f=>f.finding_id===report.findingId)?rows:false;},'reviewed real-model finding delivery '+worker):(await api(worker,'/api/v4/findings')).value.findings;assert.equal(rows.some(f=>f.finding_id===report.findingId),affected);
  if(affected){const workerPage=await pageFor(worker);await workerPage.goto(origin(worker)+'/#/business/findings/'+report.findingId);const card=workerPage.getByTestId('finding-'+report.findingId);await card.waitFor();if(rows.find(f=>f.finding_id===report.findingId).status==='new')await card.getByRole('button',{name:/Acknowledge/i}).click();await waitFor(async()=>(await api('master','/api/v4/findings')).value.receipts.some(r=>r.finding_id===report.findingId&&r.entity_id===entityId&&r.status==='acknowledged'),'signed acknowledgment '+worker);await workerPage.screenshot({path:'artifacts/phase10a-real-'+worker+'-finding.png',fullPage:false});}
  report.deliveries.push({worker,entityId,affected,received:affected,acknowledged:affected});
 }
 await page.goto(origin('master')+'/#/business/findings/'+report.findingId);const masterCard=page.getByTestId('finding-'+report.findingId);await masterCard.waitFor();await waitFor(async()=>{await page.reload();return (await page.getByTestId('finding-'+report.findingId).innerText()).includes('acknowledged');},'Master delivery presentation');await page.getByText('Loading findings…',{exact:true}).waitFor({state:'hidden'});assert(!(await page.getByTestId('finding-'+report.findingId).innerText()).includes('Company no longer in scope'));await page.getByRole('heading',{name:'Delivery & Acknowledgment',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/phase10a-real-master-delivery.png',fullPage:false});assert.deepEqual(report.browserErrors,[]);
 report.checks=['Reviewed real-model narrative matches refreshed browser investigation and independently recomputed source calculations','Finding published through the existing authenticated Business UI','Only affected Workers receive finding; browser acknowledgments synchronize signed receipts to Master','No JavaScript errors, manufacturing or purchasing execution'];report.status='passed';console.log('PASS reviewed real-model finding browser publication, affected-only delivery and acknowledgment');
}catch(e){report.status='failed';report.error=e.message;throw e;}finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile('artifacts/phase10a-reviewed-finding.json',JSON.stringify(report,null,2)+'\n');}
