import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const load=name=>import(pathToFileURL(path.resolve('scripts',name)).href);
const {directory,compose,docker}=await load('lib.mjs');
const {digest}=await import(pathToFileURL(path.resolve('packages/module-sdk/dist/index.js')).href);
const recordsHash=(key,id)=>compose('exec','-T',key+'-db','psql','-U','postgres','-d','m_'+digest(id).slice(0,20),'-At','-v','ON_ERROR_STOP=1','-c',"SELECT md5(coalesce(jsonb_agg(to_jsonb(b)-'revision'-'updated_at' ORDER BY id)::text,'[]')) FROM business_records b");
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');
const {api,logins,credentials,origin,waitFor}=await load('phase4-client.mjs');
const clean=value=>Object.values(credentials.accounts).reduce((text,account)=>typeof account?.password==='string'?text.replaceAll(account.password,'[REDACTED]'):text,String(value));await logins();await mkdir('artifacts/phase12-screenshots',{recursive:true});
const report={startedAt:new Date().toISOString(),checks:[],browserErrors:[],installations:[]};
const expected=[['cee.sales','1.3.1'],['cee.stock-ledger','1.1.0'],['steward.simulation.fulfillment','1.0.1'],['steward.simulation.commerce','1.1.0']];
const image=key=>JSON.parse(docker(['inspect',compose('ps','-q',key+'-api')]))[0].Image;
const before=Object.fromEntries(['worker-1','worker-2','worker-3'].map(k=>[k,image(k)]));
const worker3=(await api('worker-3','/api/v3/modules')).value.installed.map(m=>({id:m.moduleId,version:m.version,configuration:m.configuration,image:m.imageId,operationId:m.operationId}));
const browser=await chromium.launch({headless:true});
try{
 for(const key of ['worker-1','worker-2']){
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1520,height:1040}}),page=await context.newPage();page.setDefaultTimeout(180000);page.on('pageerror',e=>report.browserErrors.push(clean(e.message)));
  await page.goto(origin(key));await page.getByLabel('Username',{exact:true}).fill(credentials.accounts[key].username);await page.getByLabel('Password',{exact:true}).fill(credentials.accounts[key].password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('navigation',{name:'Workspaces',exact:true}).waitFor();
  for(const [id,version]of expected){
   await page.goto(origin(key)+'/#/administration/modules');const state=(await api(key,'/api/v3/modules')).value,installed=state.installed.find(m=>m.moduleId===id),p=state.available.find(p=>p.packageId===id+'@'+version);assert(p?.trusted&&p?.compatible,'Signed compatible '+id+' on '+key);
   const preserved=installed&&id.startsWith('steward.simulation.')?recordsHash(key,id):null;
   if(installed?.version!==version){const card=page.getByTestId('package-'+id+'@'+version);await card.waitFor();const request=page.waitForResponse(r=>r.url().endsWith('/api/v3/modules/install')&&r.request().method()==='POST');await card.getByRole('button',{name:(installed?'Upgrade to ':'Install ')+p.manifest.name,exact:true}).click();const response=await request;assert.equal(response.status(),200,id+' '+await response.text());}
   await waitFor(async()=>{const m=(await api(key,'/api/v3/modules')).value.installed.find(m=>m.moduleId===id);return m?.version===version&&['installed','active','disabled'].includes(m.state);},'installed '+id,180000);
   const m=(await api(key,'/api/v3/modules')).value.installed.find(m=>m.moduleId===id);if(m.state!=='active'){await page.reload();const request=page.waitForResponse(r=>r.url().endsWith('/'+id+'/lifecycle')&&r.request().method()==='POST');await page.getByTestId('installed-'+id).getByRole('button',{name:'Activate '+p.manifest.name,exact:true}).click();assert.equal((await request).status(),200);}
   if(preserved!==null)assert.equal(recordsHash(key,id),preserved,'Retain existing simulation records through package upgrade');report.installations.push({worker:key,moduleId:id,version,state:'active',installedThroughBrowser:installed?.version!==version,existingRecordsPreserved:preserved!==null});
  }
  await page.reload();await page.goto(origin(key)+'/#/administration/module/steward.simulation.commerce/control-center');await page.getByRole('heading',{name:'Simulation Control Center',level:2,exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Module Manager',exact:true}).count(),0);
  await page.getByText('Loading records…',{exact:true}).waitFor({state:'hidden'});await page.getByText('Loading Module Manager…',{exact:true}).waitFor({state:'hidden'});await page.screenshot({path:'artifacts/phase12-screenshots/'+key+'-control-center-empty.png',fullPage:true});await context.close();
 }
 for(const key of Object.keys(before))assert.equal(image(key),before[key],'Module installation must not change Worker core');
 assert.deepEqual((await api('worker-3','/api/v3/modules')).value.installed.map(m=>({id:m.moduleId,version:m.version,configuration:m.configuration,image:m.imageId,operationId:m.operationId})),worker3,'Worker 3 module configurations/identities must remain unchanged');
 report.checks.push('real browser authentication, signed package installation/upgrades and activation on two retained Workers','dedicated declarative Administration Control Center without Module Manager framing','core image hashes unchanged by module installation; Worker 3 preserved');report.status='passed';
}catch(e){report.status='failed';report.error=clean(e.message);throw Error(report.error);}finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile('artifacts/phase12-browser-installation.json',JSON.stringify(report,null,2)+'\n');}
