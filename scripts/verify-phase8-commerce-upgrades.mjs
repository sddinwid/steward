import {moduleNavigation,openWorkspace,fillAdvancedJson} from './ui-navigation.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {digest} from '../packages/module-sdk/dist/index.js';
import {directory,compose,docker} from './lib.mjs';
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');process.env.STEWARD_DEMO_RETRY_LOGIN='1';
const {api,logins,sessions,origin,waitFor}=await import('./phase4-client.mjs');await logins();
const report={startedAt:new Date().toISOString(),checks:[],browserErrors:[]},browser=await chromium.launch({headless:true});
function snapshot(key,id){return compose('exec','-T',key+'-db','psql','-U','postgres','-d','m_'+digest(id).slice(0,20),'-At','-c',"SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM business_records t WHERE kind NOT IN ('connector','shop')");}
const core=key=>JSON.parse(docker(['inspect',compose('ps','-q',key+'-api')]))[0].Image;
try{for(const key of ['worker-1','worker-3']){
 const context=await browser.newContext({ignoreHTTPSErrors:true});await context.addCookies([{name:'__Host-steward',value:sessions[key].cookie.split('=')[1],url:origin(key),secure:true,httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage();page.on('pageerror',e=>report.browserErrors.push(e.message));await page.goto(origin(key));const image=core(key);
 for(const [id,version,name]of [['cee.sales','1.1.1','Sales'],['cee.printify','1.0.2','Printify']]){
  const existing=(await api(key,'/api/v3/modules')).value.installed.find(m=>m.moduleId===id),before=snapshot(key,id);assert(existing);if(existing.version!==version){const card=page.getByTestId('package-'+id+'@'+version),response=page.waitForResponse(r=>r.url().endsWith('/api/v3/modules/install')&&r.request().method()==='POST',{timeout:180000});await card.getByRole('button',{name:'Upgrade to '+name,exact:true}).click();assert.equal((await response).status(),200);const activation=page.waitForResponse(r=>r.url().endsWith('/'+id+'/lifecycle'));await page.getByRole('button',{name:'Activate '+name,exact:true}).click();assert.equal((await activation).status(),200);}
  assert.equal(snapshot(key,id),before);assert.equal(core(key),image);report.checks.push({worker:key,moduleId:id,version,businessRecordsPreserved:true,coreImageUnchanged:true});
 }
 const shop=await waitFor(async()=>{const rows=(await api(key,'/api/v3/modules/cee.printify/api/shops')).value.records;return rows[0]??false;},'authorized configured shop');await moduleNavigation(page).getByRole('button',{name:'printify shop',exact:true}).click();await page.getByTestId('module-screen-cee.printify').getByText(shop.sourceId,{exact:true}).waitFor();await page.screenshot({path:'artifacts/phase8-'+key+'-shop-upgrade.png',fullPage:true});await context.close();
}assert.deepEqual(report.browserErrors,[]);report.status='passed';console.log('PASS browser commerce patch upgrades retain all Sales/Printify business records and core image IDs; configured shops dynamically appear');}catch(e){report.status='failed';report.error=e.message;throw e;}finally{await browser.close();report.finishedAt=new Date().toISOString();await writeFile('artifacts/phase8-commerce-upgrades.json',JSON.stringify(report,null,2)+'\n');}
