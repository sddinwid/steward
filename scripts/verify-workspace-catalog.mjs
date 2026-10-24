// Visible UI acceptance on the explicitly selected synthetic deployment.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {directory} from './lib.mjs';
import {screenGroup} from '../packages/ui/dist/presentation.js';
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');
const {origin,credentials}=await import('./phase4-client.mjs');
const browser=await chromium.launch({headless:true}),report={startedAt:new Date().toISOString(),checks:[],errors:[]};
try{
 for(const key of ['master','worker-1','worker-2','worker-3']){
  const c=await browser.newContext({ignoreHTTPSErrors:true}),page=await c.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));await page.goto(origin(key));const a=credentials.accounts[key==='master'?'registry':key];await page.getByLabel('Username',{exact:true}).fill(a.username);await page.getByLabel('Password',{exact:true}).fill(a.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('navigation',{name:'Workspaces',exact:true}).waitFor();
  if(process.argv.includes('--settings')&&key!=='master'){
   await page.goto(origin(key)+'/#/administration/settings');await page.getByLabel('Country',{exact:true}).selectOption('US');await page.getByLabel('Base currency',{exact:true}).selectOption('USD');await page.getByRole('button',{name:'Save company preferences',exact:true}).click();await page.getByText('Company preferences saved. Historical records unchanged.',{exact:true}).waitFor();report.checks.push(key+' explicitly saves US/USD preferences through UI');
  }
  if(key==='master'){for(const route of ['overview','companies','reports','opportunities','history','findings','analyst']){await page.goto(origin(key)+'/#/business/'+route);await page.locator('h1').waitFor();await page.reload();await page.locator('h1').waitFor();}for(const route of ['companies','settings']){await page.goto(origin(key)+'/#/administration/'+route);await page.locator('h1').waitFor();}report.checks.push('Master dashboard, companies, relationships, reports, history, findings, Analyst and administration deep links');}
  else{
   const modules=await page.evaluate(async()=>{const r=await fetch('/api/v3/modules/discovery');return(await r.json()).modules;});
   for(const m of modules)for(const s of m.ui){const group=screenGroup(m,s),workspace=group==='Connections'?'administration':group==='Integration diagnostics'?'developer':'business';await page.goto(origin(key)+'/#/'+workspace+'/module/'+m.moduleId+'/'+s.screenId);const section=page.getByTestId('module-screen-'+m.moduleId);await section.waitFor();await section.getByRole('button',{name:'Refresh records',exact:true}).click();await section.getByRole('status').waitFor({state:'hidden'});assert.equal(await section.getByRole('alert').count(),0,key+' '+m.moduleId+'/'+s.screenId);await page.reload();await page.getByTestId('module-screen-'+m.moduleId).waitFor();report.checks.push(key+' '+m.moduleId+'/'+s.screenId+' visible, readable, refresh and deep link');}
   await page.goto(origin(key)+'/#/business/module/cee.not-installed/absent');await page.getByRole('alert').getByText('This screen is unavailable, uninstalled or not authorized for your account.',{exact:true}).waitFor();report.checks.push(key+' unavailable module state');
  }
  await page.goto(origin(key)+'/#/business/overview');await page.screenshot({path:'artifacts/ux-catalog-'+key+'.png',fullPage:true});await c.close();
 }
 assert.deepEqual(report.errors,[]);report.status='passed';console.log('PASS '+report.checks.length+' catalog/workspace browser checks');
}catch(e){report.status='failed';report.failure=e.message;throw e;}finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile('artifacts/ux-catalog.json',JSON.stringify(report,null,2)+'\n');}
