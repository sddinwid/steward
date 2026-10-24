// Isolated fixture acceptance. Never use against an operator deployment.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {directory,sql} from './lib.mjs';
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');
const {api,origin,credentials,logins,deployment}=await import('./phase4-client.mjs');
const report={startedAt:new Date().toISOString(),checks:[],errors:[]};const check=s=>{report.checks.push(s);console.log('PASS '+s);};
const browser=await chromium.launch({headless:true});
try{
 await logins();
 const before=JSON.parse(await readFile('artifacts/ux-isolated-before.json'));
 for(const i of deployment.instances)for(const [table,hash] of Object.entries(before[i.key]))assert.equal(sql(i.key,`SELECT count(*)||':'||md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM ${table} t`),hash,i.key+' '+table+' changed during redeployment');
 check('redeployment preserves exact account, identity, enrollment, module, finding and investigation rows');
 async function pageFor(key){const context=await browser.newContext({ignoreHTTPSErrors:true});const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));await page.goto(origin(key));const account=credentials.accounts[key==='master'?'registry':key];await page.getByLabel('Username',{exact:true}).fill(account.username);await page.getByLabel('Password',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('navigation',{name:'Workspaces',exact:true}).waitFor();return page;}
 const worker=await pageFor('worker-1');await worker.getByRole('heading',{name:'Business Overview',exact:true}).waitFor();
 assert.equal(await worker.getByRole('heading',{name:'Module Manager',exact:true}).count(),0);
 const discovery=(await api('worker-1','/api/v3/modules/discovery')).value.modules;
 for(const m of discovery){for(const s of m.ui){const group=['connection','mapping'].includes(s.screenId)?'administration':s.screenId==='integration-status'?'developer':'business';await worker.goto(origin('worker-1')+'/#/'+group+'/module/'+m.moduleId+'/'+s.screenId);await worker.getByTestId('module-screen-'+m.moduleId).waitFor();}}
 check('all authorized installed Worker module screens open through persistent deep links');
 await worker.goto(origin('worker-1')+'/#/administration/modules');await worker.getByRole('heading',{name:'Module Manager',exact:true}).waitFor();await worker.goto(origin('worker-1')+'/#/developer/diagnostics');await worker.getByRole('heading',{name:'Smart Modules',exact:true}).waitFor();check('Worker administration and developer governance are separate navigable destinations');
 await worker.goto(origin('worker-1')+'/#/administration/settings');await worker.getByRole('heading',{name:'Company & Localization',exact:true,level:2}).waitFor();await worker.getByLabel('Base currency',{exact:true}).selectOption('USD');await worker.getByRole('button',{name:'Save company preferences',exact:true}).click();await worker.getByRole('status').filter({hasText:'Company preferences saved'}).waitFor();await worker.reload();await worker.getByLabel('Base currency',{exact:true}).waitFor();await worker.waitForFunction(()=>document.querySelector('select[aria-label="Base currency"]')?.value==='USD');
 assert.equal((await api('worker-1','/api/v2/workspace/profile')).value.preferences.baseCurrency,'USD');check('explicit USD company preference survives browser refresh and authenticated retrieval');
 const master=await pageFor('master');await master.getByRole('heading',{name:'Executive Overview',exact:true}).waitFor();await master.getByRole('heading',{name:'Companies & Synchronization',exact:true}).waitFor();await master.goto(origin('master')+'/#/business/history');await master.getByLabel('Investigation history',{exact:true}).waitFor();const runs=(await api('master','/api/v5/analyst/investigations')).value.investigations;if(runs.length){await master.getByLabel('Investigation history',{exact:true}).selectOption(runs[0].investigation_id);await master.getByTestId('analyst-status').waitFor();await master.goto(origin('master')+'/#/business/history/'+runs[0].investigation_id);await master.reload();await master.getByTestId('analyst-status').waitFor();}
 check('Master executive overview and persisted investigations are accessible');
 await master.goto(origin('master')+'/#/business/findings');await master.getByRole('heading',{name:'Findings & Alerts',exact:true,level:2}).waitFor();const findings=(await api('master','/api/v4/findings')).value.findings;for(const f of findings.slice(0,2))await master.getByTestId('finding-'+f.finding_id).waitFor();check('Master renders actual persisted findings and source references');
 await worker.goto(origin('worker-1')+'/#/business/overview');await worker.screenshot({path:'artifacts/ux-worker-desktop.png',fullPage:true});await master.goto(origin('master')+'/#/business/overview');await master.getByRole('heading',{name:'Companies & Synchronization',exact:true}).waitFor();await master.screenshot({path:'artifacts/ux-master-desktop.png',fullPage:true});for(const page of [worker,master]){await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'artifacts/ux-'+(page===worker?'worker':'master')+'-mobile.png',fullPage:true});}
 assert.deepEqual(report.errors,[]);check('Chromium desktop/mobile renders without page errors or horizontal overflow');report.status='passed';
}catch(e){report.status='failed';report.failure=e.message;throw e;}finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile('artifacts/ux-workspaces.json',JSON.stringify(report,null,2)+'\n');}
