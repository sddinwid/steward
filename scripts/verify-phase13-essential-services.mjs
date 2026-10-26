// Add one idempotent synthetic essential-supply event, not participants or a new cohort.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {logins,credentials,origin,moduleApi,installed,records,seedRecord,sectionState,waitFor} from './phase13-acceptance-client.mjs';
const worker='worker-3',moduleId='steward.services.food';
const report={startedAt:new Date().toISOString(),checks:[],syntheticOnly:true};let browser;
try{
 await logins();const food=(await sectionState('food')).state,own=await sectionState('essential-services'),s=own.state;
 assert(food.foodProgramId&&food.siteId,'Complete the existing Food foundation first');
 const programId=food.foodProgramId;
 s.startsAt??=new Date(Date.now()-60000).toISOString();s.endsAt??=new Date(Date.now()+7*86400000).toISOString();await own.persist();
 const stock=await seedRecord(worker,moduleId,'/supplies','P13-ESSENTIAL-STOCK',{programId,code:'P13-ESSENTIAL-STOCK',name:'Synthetic essential hygiene supplies',category:'essential-supplies',mode:'local',quantity:24,minStock:4});
 const session=await seedRecord(worker,moduleId,'/sessions','P13-ESSENTIAL-SESSION',{programId,code:'P13-ESSENTIAL-SESSION',siteId:food.siteId,category:'essential-supplies',plannedCapacity:12,startsAt:s.startsAt,endsAt:s.endsAt});
 const sealedBefore=await moduleApi(worker,moduleId,'/published-aggregates');
 browser=await chromium.launch({headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin(worker));await page.getByLabel('Username',{exact:true}).fill(credentials.accounts[worker].username);await page.getByLabel('Password',{exact:true}).fill(credentials.accounts[worker].password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('navigation',{name:'Workspaces',exact:true}).waitFor();
 await page.goto(origin(worker)+'/#/business/module/'+moduleId+'/service-deliveries');const view=page.getByTestId('module-screen-'+moduleId),metadata=(await installed(worker,moduleId)).manifest.ui.find(v=>v.screenId==='service-deliveries');await view.getByRole('heading',{name:metadata.title,exact:true}).waitFor();
 let delivery=(await records(worker,moduleId,'/deliveries')).find(r=>r.id===s.deliveryId||s.code&&r.code===s.code&&r.programId===programId);
 if(!delivery){s.code=await view.getByLabel('Code',{exact:true}).inputValue();await own.persist();for(const[name,value]of Object.entries({programId,sessionId:session.id,stockId:stock.id,quantity:6,stockQuantity:6})){const field=metadata.fields.find(f=>f.name===name),input=view.getByLabel(field.label,{exact:true});if(field.reference){await input.locator('option[value="'+value+'"]').waitFor({state:'attached'});await input.selectOption(value);}else await input.fill(String(value));}const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/'+moduleId+'/api/deliveries'));await view.getByRole('button',{name:'Create record',exact:true}).click();assert.equal((await response).status(),201);delivery=await waitFor(async()=>(await records(worker,moduleId,'/deliveries')).find(r=>r.code===s.code&&r.programId===programId),'essential delivery');report.createdThroughBrowser=true;}
 assert.equal(delivery.status,'delivered');assert.equal(delivery.category,'essential-supplies');assert.equal(delivery.quantity,6);assert.equal(delivery.stockQuantity,6);s.deliveryId=delivery.id;await own.persist();
 const matching=(await records(worker,moduleId,'/deliveries')).filter(r=>r.sessionId===session.id);assert.equal(matching.length,1);const overview=await moduleApi(worker,moduleId,'/programme-overview?q='+programId);assert(overview.deliveredEssentialUnits>=6);assert.deepEqual(await moduleApi(worker,moduleId,'/published-aggregates'),sealedBefore,'Historical sealed cohort must remain unchanged');
 await view.getByRole('row').filter({hasText:s.code}).waitFor();await page.screenshot({path:'artifacts/phase13-essential-services-browser.png',fullPage:true});assert.deepEqual(errors,[]);
 report.checks.push('Six actual synthetic essential units delivered through module-owned operations and generic SSDS browser form; six stock units recorded','Repeated acceptance reuses the original delivery/session without duplicate consumption','Existing sealed historical cohort remains byte-for-byte unchanged; no participants or live commerce modified');report.status='passed';console.log('PASS essential-services browser delivery, persistence, safe repeat and immutable historical aggregate.');
}catch(e){report.status='failed';report.error=Object.values(credentials.accounts).reduce((s,a)=>a?.password?s.replaceAll(a.password,'[REDACTED]'):s,String(e.message));process.exitCode=1;console.log(report.error);}finally{await browser?.close();await writeFile('artifacts/phase13-essential-services.json',JSON.stringify(report,null,2)+'\n');}
