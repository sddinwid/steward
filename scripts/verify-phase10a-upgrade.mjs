import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {directory,compose,docker} from './lib.mjs';
import {digest} from '../packages/module-sdk/dist/index.js';
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');
const {api,logins,sessions,origin,waitFor}=await import('./phase4-client.mjs');
const report={startedAt:new Date().toISOString(),checks:[],browserErrors:[]};
const database='m_'+digest('cee.sales').slice(0,20);
const sql=(key,query)=>compose('exec','-T',key+'-db','psql','-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1','-c',query);
const records=key=>sql(key,"SELECT md5(coalesce(jsonb_agg(to_jsonb(b)-'revision'-'updated_at' ORDER BY id)::text,'')) FROM business_records b");
const image=key=>JSON.parse(docker(['inspect',compose('ps','-q',key+'-api')]))[0].Image;
const browser=await chromium.launch({headless:true});
try{
 await logins();
 for(const key of ['worker-1','worker-3']){
  const installed=(await api(key,'/api/v3/modules')).value.installed.find(m=>m.moduleId==='cee.sales');assert(installed);
  const before={records:records(key),configuration:installed.configuration,image:image(key),enrollment:compose('exec','-T',key+'-db','psql','-U','postgres','-d','steward','-At','-c',"SELECT md5(certificate::text) FROM local_enrollment WHERE singleton")};
  const context=await browser.newContext({ignoreHTTPSErrors:true});await context.addCookies([{name:'__Host-steward',value:sessions[key].cookie.split('=')[1],url:origin(key),secure:true,httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage();page.on('pageerror',e=>report.browserErrors.push(e.message));await page.goto(origin(key)+'/#/administration/modules');page.setDefaultTimeout(180000);
  if(installed.version!=='1.2.1'){
   const response=page.waitForResponse(r=>r.url().endsWith('/api/v3/modules/install')&&r.request().method()==='POST');await page.getByTestId('package-cee.sales@1.2.1').getByRole('button',{name:'Upgrade to Sales',exact:true}).click();assert.equal((await response).status(),200);
   const activation=page.waitForResponse(r=>r.url().endsWith('/cee.sales/lifecycle'));await page.getByTestId('installed-cee.sales').getByRole('button',{name:'Activate Sales',exact:true}).click();assert.equal((await activation).status(),200);
  }
  assert.equal(records(key),before.records,'Authority data and stable business identities must be preserved');assert.equal(image(key),before.image);assert.deepEqual((await api(key,'/api/v3/modules')).value.installed.find(m=>m.moduleId==='cee.sales').configuration,before.configuration);assert.equal(compose('exec','-T',key+'-db','psql','-U','postgres','-d','steward','-At','-c',"SELECT md5(certificate::text) FROM local_enrollment WHERE singleton"),before.enrollment);
  const conflicts=sql(key,"SELECT count(*) FROM (SELECT envelope->>'recordId' FROM sync_outbox WHERE acknowledged_at IS NULL AND envelope->>'streamId'='commerce_orders' GROUP BY envelope->>'recordId',envelope->>'recordRevision' HAVING count(DISTINCT envelope->'payload')>1)t");assert.equal(conflicts,'0');
  const repaired=Number(sql(key,'SELECT count(*) FROM commerce_projection_repairs'));await waitFor(async()=>sql(key,"SELECT count(*) FROM sync_outbox WHERE acknowledged_at IS NULL AND envelope->>'streamId'='commerce_orders'")==='0','repaired financial snapshots synchronize',120000);
  report.checks.push({worker:key,version:'1.2.1',repairedEnvelopesRetained:repaired,businessDataPreserved:true,configurationPreserved:true,enrollmentPreserved:true,coreImageUnchanged:true,queueRecovered:true});await context.close();
 }
 assert.deepEqual(report.browserErrors,[]);report.status='passed';console.log('PASS browser Sales 1.2.1 append-only migration repairs retained financial envelopes, synchronizes canonical higher revisions, and preserves data/configuration/identity/core images');
}catch(e){report.status='failed';report.error=e.message;throw e;}finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile('artifacts/phase10a-upgrade.json',JSON.stringify(report,null,2)+'\n');}
