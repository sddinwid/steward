import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {directory,compose,docker} from './lib.mjs';
import {digest} from '../packages/module-sdk/dist/index.js';
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');
const {api,logins,sessions,origin}=await import('./phase4-client.mjs');
const report={startedAt:new Date().toISOString(),checks:[],browserErrors:[]},browser=await chromium.launch({headless:true});
function data(key,id){return compose('exec','-T',key+'-db','psql','-U','postgres','-d','m_'+digest(id).slice(0,20),'-At','-v','ON_ERROR_STOP=1','-c',"SELECT md5(coalesce(jsonb_agg(to_jsonb(b) ORDER BY id)::text,'')) FROM business_records b WHERE kind NOT IN ('connector','commerce-condition')");}
const core=key=>JSON.parse(docker(['inspect',compose('ps','-q',key+'-api')]))[0].Image;
try{
 await logins();
 for(const key of ['worker-1','worker-3']){
  const context=await browser.newContext({ignoreHTTPSErrors:true});await context.addCookies([{name:'__Host-steward',value:sessions[key].cookie.split('=')[1],url:origin(key),secure:true,httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage();page.setDefaultTimeout(180000);page.on('pageerror',e=>report.browserErrors.push(e.message));await page.goto(origin(key)+'/#/administration/modules');
  for(const id of ['cee.shopify','cee.printify']){
   const installed=(await api(key,'/api/v3/modules')).value.installed.find(m=>m.moduleId===id);assert(installed);const before={data:data(key,id),core:core(key),configuration:installed.configuration};
   if(installed.version!=='1.1.1'){
    const response=page.waitForResponse(r=>r.url().endsWith('/api/v3/modules/install')&&r.request().method()==='POST');await page.getByTestId('package-'+id+'@1.1.1').getByRole('button',{name:'Upgrade to '+installed.manifest.name,exact:true}).click();assert.equal((await response).status(),200);
    const activated=page.waitForResponse(r=>r.url().endsWith('/'+id+'/lifecycle'));await page.getByTestId('installed-'+id).getByRole('button',{name:'Activate '+installed.manifest.name,exact:true}).click();assert.equal((await activated).status(),200);
   }
   assert.equal(data(key,id),before.data,'Connector source records, identities, mappings, jobs and receipts must remain unchanged');assert.equal(core(key),before.core);assert.deepEqual((await api(key,'/api/v3/modules')).value.installed.find(m=>m.moduleId===id).configuration,before.configuration);
   const version=compose('exec','-T',key+'-db','psql','-U','postgres','-d','m_'+digest(id).slice(0,20),'-At','-c','SELECT max(version) FROM module_migrations');assert.equal(version,'4');report.checks.push({worker:key,moduleId:id,version:'1.1.1',appendOnlyMigration:4,authorityDataPreserved:true,configurationPreserved:true,coreImageUnchanged:true});
  }
  await context.close();
 }
 assert.deepEqual(report.browserErrors,[]);report.status='passed';console.log('PASS connector publication-gate upgrades preserve source observations, store identities, mappings, production jobs, configuration and Worker core images');
}catch(e){report.status='failed';report.error=e.message;throw e;}finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile('artifacts/phase10a-connector-upgrade.json',JSON.stringify(report,null,2)+'\n');}
