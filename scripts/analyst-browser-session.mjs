// Optional real-provider acceptance driver. Credentials remain in private fixture files.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {credentials,origin,api,waitFor} from './phase4-client.mjs';
export async function analystBrowserSession(){
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({ignoreHTTPSErrors:true}),errors=[];
 async function login(key){const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin(key));await page.getByLabel('Username',{exact:true}).fill(credentials.accounts[key==='master'?'registry':key].username);await page.getByLabel('Password',{exact:true}).fill(credentials.accounts[key==='master'?'registry':key].password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('navigation',{name:'Workspaces',exact:true}).waitFor();return page;}
 const page=await login('master');
 async function evidence(report){
  try{await page.goto(origin('master')+'/#/business/history/'+report.investigationId);await page.reload();await page.getByTestId('analyst-evidence').waitFor();}
  catch(error){report.browserFailure={url:page.url(),pageErrors:[...errors],alerts:await page.getByRole('alert').allTextContents()};await page.screenshot({path:'artifacts/ux-live-analyst-browser-failure.png',fullPage:true});throw error;}
 }
 return {
  async start(capability,prompt){await page.goto(origin('master')+'/#/business/analyst');await page.getByLabel('Investigation capability',{exact:true}).selectOption(capability);await page.getByLabel('Investigation question',{exact:true}).fill(prompt);const response=page.waitForResponse(r=>r.url().endsWith('/api/v5/analyst/investigations')&&r.request().method()==='POST');await page.getByRole('button',{name:'Investigate',exact:true}).click();const r=await response;assert.equal(r.status(),202);return {value:await r.json()};},
  async publish(id){await page.goto(origin('master')+'/#/business/history/'+id);await page.getByTestId('analyst-evidence').waitFor({timeout:20000});const reviewed=page.getByRole('checkbox',{name:/I reviewed the scientific source basis/});if(await reviewed.count())await reviewed.check();await page.screenshot({path:'artifacts/ux-live-analyst.png',fullPage:true});const response=page.waitForResponse(r=>r.url().endsWith('/'+id+'/finding')&&r.request().method()==='POST');await page.getByRole('button',{name:'Publish finding for human review',exact:true}).click();const r=await response;assert.equal(r.status(),200);return {value:await r.json()};},
  async verify(report){
   await evidence(report);assert.ok((await page.getByTestId('analyst-evidence').innerText()).includes(report.result.narrative));
   if(!report.findingId){await page.screenshot({path:'artifacts/ux-live-analyst-unpublished.png',fullPage:true});assert.deepEqual(errors,[]);report.browser={launchedThroughUI:true,publishedThroughUI:false,historyRefresh:true,workerAcknowledgments:false,errors};return;}
   for(const d of report.deliveries.filter(d=>d.affected)){const worker=await login(d.worker);await worker.goto(origin(d.worker)+'/#/business/findings/'+report.findingId);const card=worker.getByTestId('finding-'+report.findingId);await card.waitFor();const ack=card.getByRole('button',{name:/Acknowledge/i});await ack.click();await waitFor(async()=>(await api(d.worker,'/api/v4/findings')).value.findings.find(f=>f.finding_id===report.findingId)?.status==='acknowledged','browser Worker finding acknowledgment');await worker.screenshot({path:'artifacts/ux-live-'+d.worker+'-finding.png',fullPage:true});}
   await page.goto(origin('master')+'/#/business/findings/'+report.findingId);await page.getByTestId('finding-'+report.findingId).waitFor();await waitFor(async()=>{await page.reload();return (await page.getByTestId('finding-'+report.findingId).innerText()).includes('acknowledged');},'Master acknowledgment display');await page.screenshot({path:'artifacts/ux-live-master-delivery.png',fullPage:true});assert.deepEqual(errors,[]);report.browser={launchedThroughUI:true,publishedThroughUI:true,historyRefresh:true,workerAcknowledgments:true,errors};
  },
  close:()=>browser.close()
 };
}
