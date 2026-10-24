import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {api,login,credentials,sessions,origin,waitFor} from './phase4-client.mjs';
const prior=JSON.parse(await readFile('artifacts/phase5-results.json','utf8'));
await login('master',credentials.accounts.registry);
for(const w of ['worker-2','worker-3'])await login(w,credentials.accounts[w]);
const id=prior.browserInvestigationId;assert.ok(id);
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({ignoreHTTPSErrors:true});
 await context.addCookies([{name:'__Host-steward',value:sessions.master.cookie.split('=')[1],url:origin('master'),secure:true,httpOnly:true,sameSite:'Strict'}]);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin('master')+'/#/business/analyst');await page.getByLabel('Investigation history').selectOption(id);await page.getByTestId('analyst-evidence').waitFor();
 await page.getByText('TEST MODEL: validation result, not a live AI provider.',{exact:true}).waitFor();
 const current=(await api('master','/api/v5/analyst/investigations/'+id)).value.investigation;
 if(!current.finding_id){const response=page.waitForResponse(r=>r.url().endsWith('/'+id+'/finding')&&r.request().method()==='POST');await page.getByRole('button',{name:'Publish finding for human review',exact:true}).click();assert.equal((await response).status(),200);}
 await page.getByText('Published finding:',{exact:false}).waitFor();
 for(const w of ['worker-2','worker-3'])await waitFor(async()=>((await api(w,'/api/v4/findings')).value.findings).some(f=>f.finding_id===id),'browser finding delivery '+w);
 assert.deepEqual(errors,[]);
 await page.locator('section[aria-label="AI Analyst"]').screenshot({path:'artifacts/phase5-analyst-workspace.png'});
 await writeFile('artifacts/phase5-publish-browser.json',JSON.stringify({verifiedAt:new Date().toISOString(),investigationId:id,findingId:id,deliveredTo:['worker-2','worker-3'],browserErrors:errors,assertions:'all passed'},null,2)+'\n');
 console.log('PASS persisted test-model attribution, explicit browser finding publication and actual affected-Worker delivery; no JavaScript errors');
}finally{await browser.close();}
