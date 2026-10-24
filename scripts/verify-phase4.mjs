import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright';
import { api,logins,login,origin,sessions,credentials,waitFor,deployment } from './phase4-client.mjs';
import { directory,compose,sql,docker,json } from './lib.mjs';
import { signAssertion } from '../packages/platform/dist/security/crypto.js';
import { digest } from '../packages/module-sdk/dist/index.js';
const results={startedAt:new Date().toISOString(),checks:[]};const pass=s=>{results.checks.push(s);console.log('PASS '+s);};
await mkdir('artifacts',{recursive:true});await logins();const seed=JSON.parse(await readFile('artifacts/phase4-seed.json','utf8'));const entities=seed.entities;
const moduleDb=(worker,module,query)=>compose('exec','-T',worker+'-db','psql','-U','postgres','-d','m_'+digest(module).slice(0,20),'-At','-v','ON_ERROR_STOP=1','-c',query);
const masterId=deployment.instances.find(i=>i.key==='master').installationId;
const records=()=>api('master','/api/v4/analytics').then(r=>r.value.records);
const modulePath='/api/v3/modules/cee.operations/api/';
const keys={};for(const worker of ['worker-1','worker-2','worker-3'])keys[worker]=await readFile(path.join(directory,'security',worker,'identity-key.pem'),'utf8');
async function exchange(worker,events=[],expected=200,extra={}){const proof={protocol:'steward-sync-v1',installationId:deployment.instances.find(i=>i.key===worker).installationId,entityId:entities[worker],nonce:randomUUID(),issuedAt:Date.now(),events,acknowledgments:[],...extra};const signed=signAssertion(proof,keys[worker]);const response=await api('master','/api/v4/sync/exchange','POST',signed,expected,null);return{proof:signed,response:response.value};}
const browser=await chromium.launch({headless:true});const pages={};const pageErrors=[];let stopped=false;
try{
 for(const key of ['master','worker-1','worker-2','worker-3']){const context=await browser.newContext({ignoreHTTPSErrors:true});await context.addCookies([{name:'__Host-steward',value:sessions[key].cookie.split('=')[1],url:origin(key),secure:true,httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage();pages[key]=page;page.on('pageerror',e=>pageErrors.push(e.message));await page.goto(origin(key),{waitUntil:'networkidle'});}
 const created={};
 for(const [worker,label,stream,fields]of[
  ['worker-1','Capacity','capacities',{'Total capacity (m³)':'1000','Utilized capacity (m³)':'300','Monthly operating cost':'2000'}],
  ['worker-2','Storage requirements','storage_requirements',{'Required storage (m³)':'500','Utilized storage (m³)':'420','Monthly external storage cost':'10000'}],
  ['worker-3','Warehouse assets','warehouse_assets',{'Total capacity (m³)':'1500','Utilized capacity (m³)':'300','Monthly operating cost':'4500'}]]){
  const page=pages[worker];await page.getByRole('navigation',{name:'Module navigation'}).getByRole('button',{name:label,exact:true}).click();const screen=page.getByTestId('module-screen-cee.operations');
  const name='Browser phase4 '+worker+' '+randomUUID().slice(0,8);await screen.getByLabel('Record name',{exact:true}).fill(name);await screen.getByLabel('Location',{exact:true}).fill('Synthetic site');for(const [label,value]of Object.entries(fields))await screen.getByLabel(label,{exact:true}).fill(value);await screen.getByLabel('Currency (ISO code)',{exact:true}).fill('EUR');
  let response=page.waitForResponse(r=>r.url().includes('/cee.operations/api/')&&r.request().method()==='POST');await screen.getByRole('button',{name:'Create record',exact:true}).click();assert.equal((await response).status(),201);
  const row=screen.getByRole('row').filter({hasText:name});await row.getByRole('button',{name:'Edit record'}).click();await screen.getByLabel('Location',{exact:true}).fill('Verified edited site');response=page.waitForResponse(r=>r.url().includes('/cee.operations/api/')&&r.request().method()==='PUT');await screen.getByRole('button',{name:'Save changes'}).click();assert.equal((await response).status(),200);await row.getByText('Verified edited site',{exact:true}).waitFor();
  const path=worker==='worker-1'?'capacities':worker==='worker-2'?'storage':'assets';const record=(await api(worker,modulePath+path)).value.records.find(r=>r.name===name);created[worker]={record,path,stream};assert.equal(record.revision,2);
  await page.screenshot({path:`artifacts/phase4-${worker}-operations.png`,fullPage:true});
 }
 pass('All three companies create and edit persistent operational records independently through Chromium');
 await waitFor(async()=>{const rows=await records();return Object.entries(created).every(([w,v])=>rows.some(r=>r.entity_id===entities[w]&&r.record_id===v.record.id&&Number(r.revision)===2&&r.payload.site==='Verified edited site'));},'all browser records attributed and replicated');
 const analytic=(await api('master','/api/v4/analytics')).value;assert.equal(analytic.authoritative,false);assert.ok(analytic.entities.some(e=>e.entity_id===analytic.operatingEntityId));assert.ok(analytic.relationships.length>=2);assert.ok(analytic.records.every(r=>r.event_id&&r.source_at&&r.ingested_at));
 await pages.master.getByRole('button',{name:'Refresh business data',exact:true}).click();await pages.master.getByRole('heading',{name:'Entity analytical records'}).waitFor();await pages.master.screenshot({path:'artifacts/phase4-master-analytics.png',fullPage:true});
 pass('Master exposes entity-scoped analytical copies, organization relationships, operating entity, record/event provenance and freshness');
 const stock=(await api('worker-1','/api/v3/modules/cee.inventory/api/items')).value.records.find(r=>r.sku==='SYNTHETIC-FG-001');
 assert.equal(stock.quantity,800);assert.equal(stock.reservedQuantity,200);assert.equal(stock.availableQuantity,600);
 await pages['worker-1'].getByRole('navigation',{name:'Module navigation'}).getByRole('button',{name:'Inventory',exact:true}).click();
 await pages['worker-1'].getByTestId('module-screen-cee.inventory').getByRole('row').filter({hasText:'SYNTHETIC-FG-001'}).getByText('600',{exact:true}).waitFor();
 await pages['worker-1'].getByTestId('module-screen-cee.inventory').screenshot({path:'artifacts/phase4-inventory-availability.png'});
 await waitFor(async()=>(await records()).some(r=>r.entity_id===entities['worker-1']&&r.payload.sku==='SYNTHETIC-FG-001'&&Number(r.payload.reserved_quantity)===200),'inventory quantity/availability projection');
 pass('Inventory retains old records, displays 800 stock / 200 reserved / 600 available and synchronizes its declared stock projection');
 const example=JSON.parse(moduleDb('worker-1','cee.operations',`SELECT envelope FROM sync_outbox WHERE envelope->>'recordId'='${created['worker-1'].record.id}' ORDER BY created_at DESC LIMIT 1`));
 const before=sql('master','SELECT count(*) FROM sync_inbox');await exchange('worker-1',[example]);await exchange('worker-1',[example]);assert.equal(sql('master','SELECT count(*) FROM sync_inbox'),before);
 const older=JSON.parse(moduleDb('worker-1','cee.operations',`SELECT envelope FROM sync_outbox WHERE envelope->>'recordId'='${created['worker-1'].record.id}' ORDER BY created_at LIMIT 1`));await exchange('worker-1',[older]);assert.equal(Number((await records()).find(r=>r.record_id===example.recordId).revision),2);
 const conflicting=structuredClone(example);conflicting.eventId=randomUUID();conflicting.payload.site='Conflicting same revision';await exchange('worker-1',[conflicting],409);
 pass('Repeated real events deduplicate; older revisions never overwrite newer data; same-revision conflicts are rejected');
 const forged=structuredClone(example);forged.eventId=randomUUID();forged.source.entity.entityId=entities['worker-2'];await exchange('worker-1',[forged],403);
 await exchange('worker-1',[],403,{entityId:entities['worker-2']});const replay=await exchange('worker-1');await api('master','/api/v4/sync/exchange','POST',replay.proof,409,null);
 await exchange('worker-1',[],400,{issuedAt:Date.now()-120000});
 const scoped=await login('master',credentials.accounts.enroller);await api('master','/api/v4/analytics?entityId='+entities['worker-2'],'GET',undefined,403,scoped);const scopedData=(await api('master','/api/v4/analytics','GET',undefined,200,scoped)).value;assert.ok(scopedData.records.every(r=>r.entity_id===entities['worker-1']));await login('master',credentials.accounts.registry);
 const viewer=await login('master',credentials.accounts.viewer);await api('master','/api/v4/analytics','GET',undefined,403,viewer);await login('master',credentials.accounts.registry);
 await api('worker-2',modulePath+'storage','GET',undefined,401,sessions['worker-1']);
 pass('Signed cross-entity claims, unauthorized analytical access, cross-Worker sessions, stale and replayed transport proofs are rejected');

 compose('stop','master-web','master-api','master-db');stopped=true;
 const outage=[];for(const [worker,v]of Object.entries(created)){const body={...v.record,site:'Updated during Master outage'};delete body.id;delete body.available_m3;const r=(await api(worker,modulePath+v.path+'/'+v.record.id,'PUT',body)).value.record;outage.push({worker,...v,record:r});assert.equal(r.revision,3);}
 for(const worker of Object.keys(created))assert.ok(Number(moduleDb(worker,'cee.operations','SELECT count(*) FROM sync_outbox WHERE acknowledged_at IS NULL'))>=1);
 const first=deployment.instances.find(i=>i.key==='worker-1');assert.equal((await json(`http://127.0.0.1:${first.apiPort}/ready`)).status,'ready');
 docker(['kill','--signal=KILL',compose('ps','-q','worker-1-api')]);compose('up','-d','--wait','--wait-timeout','120','worker-1-api');
 assert.equal((await api('worker-1',modulePath+'capacities')).value.records.find(r=>r.id===created['worker-1'].record.id).revision,3);
 pass('Master outage does not block operational writes; durable module outboxes and committed records survive Worker SIGKILL/restart');

 // Terminate a real PostgreSQL transaction after its trigger ran, before commit.
 const db=compose('ps','-q','worker-1-db');const transactionId=randomUUID();const probe=spawn('docker',['exec','-e','PGAPPNAME=phase4-atomicity',db,'psql','-U','postgres','-d','m_'+digest('cee.operations').slice(0,20),'-v','ON_ERROR_STOP=1','-c',`BEGIN;INSERT INTO capacities(id,name,site,capacity_m3,utilized_m3,monthly_operating_cost,currency)VALUES('${transactionId}','Interrupted transaction','Synthetic',10,1,1,'EUR');SELECT pg_sleep(30);COMMIT;`],{stdio:'ignore'});
 await waitFor(()=>moduleDb('worker-1','cee.operations',"SELECT count(*) FROM pg_stat_activity WHERE application_name='phase4-atomicity' AND wait_event='PgSleep'")==='1','uncommitted transaction with outbox trigger');moduleDb('worker-1','cee.operations',"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='phase4-atomicity'");await new Promise(r=>probe.once('close',r));
 assert.equal(moduleDb('worker-1','cee.operations',`SELECT count(*) FROM capacities WHERE id='${transactionId}'`),'0');assert.equal(moduleDb('worker-1','cee.operations',`SELECT count(*) FROM sync_outbox WHERE envelope->>'recordId'='${transactionId}'`),'0');
 pass('Killing a PostgreSQL transaction rolls back both its operational write and triggered outbox event atomically');

 // Hold the receiver lock to interrupt an actual in-flight synchronization.
 compose('up','-d','--wait','master-db');const masterDb=compose('ps','-q','master-db');const workerId=first.installationId;
 const blocker=spawn('docker',['exec','-e','PGAPPNAME=phase4-delivery-interruption',masterDb,'psql','-U','postgres','-d','steward','-c',`BEGIN;SELECT pg_advisory_xact_lock(hashtext('sync:${workerId}'));SELECT pg_sleep(45);COMMIT;`],{stdio:'ignore'});
 await waitFor(()=>sql('master',"SELECT count(*) FROM pg_stat_activity WHERE application_name='phase4-delivery-interruption' AND wait_event='PgSleep'")==='1','receiver lock held');
 compose('up','-d','--wait','master-api','master-web');stopped=false;sql('worker-1','UPDATE sync_status SET next_attempt_at=now() WHERE singleton');moduleDb('worker-1','cee.operations','UPDATE sync_outbox SET next_attempt_at=now() WHERE acknowledged_at IS NULL');
 await waitFor(()=>Number(sql('master',"SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%pg_advisory_xact_lock%'"))>0,'real in-flight synchronization',20000);
 docker(['kill','--signal=KILL',compose('ps','-q','worker-1-api')]);sql('master',"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='phase4-delivery-interruption'");await new Promise(r=>blocker.once('close',r));compose('up','-d','--wait','--wait-timeout','120','worker-1-api');
 await waitFor(async()=>{const r=await records();return outage.every(v=>r.some(row=>row.record_id===v.record.id&&Number(row.revision)===3&&row.payload.site==='Updated during Master outage'));},'incremental catch-up after interruption',120000);
 for(const v of outage){const ids=moduleDb(v.worker,'cee.operations',`SELECT event_id FROM sync_outbox WHERE envelope->>'recordId'='${v.record.id}' AND (envelope->>'recordRevision')::int=3`).split('\n').filter(Boolean);assert.equal(ids.length,1);assert.equal(sql('master',`SELECT count(*) FROM sync_inbox WHERE event_id='${ids[0]}'`),'1');}
 pass('SIGKILL during an in-flight exchange resumes safely; outage changes catch up incrementally with one inbox entry per event');

 const masterPage=pages.master;await masterPage.getByRole('button',{name:'Refresh business data',exact:true}).click();
 const findingText='Synthetic storage cooperation review '+randomUUID().slice(0,8);const references=(await records()).filter(r=>[created['worker-2'].record.id,created['worker-3'].record.id].includes(r.record_id)).map(r=>({entityId:r.entity_id,moduleId:r.module_id,streamId:r.stream_id,recordId:r.record_id,revision:Number(r.revision)}));
 await masterPage.getByLabel('Finding explanation',{exact:true}).fill(findingText);await masterPage.getByLabel('Supporting references JSON',{exact:true}).fill(JSON.stringify(references));
 const entityNames=(await api('master','/api/v4/analytics')).value.entities;for(const key of ['worker-2','worker-3'])await masterPage.getByLabel('Affect '+entityNames.find(e=>e.entity_id===entities[key]).name,{exact:true}).check();
 let response=masterPage.waitForResponse(r=>r.url().endsWith('/api/v4/findings')&&r.request().method()==='POST');await masterPage.getByRole('button',{name:'Issue finding',exact:true}).click();assert.equal((await response).status(),200);
 const finding=await waitFor(async()=>{const rows=(await api('master','/api/v4/findings')).value.findings;return rows.find(f=>f.explanation===findingText);},'created finding');results.findingId=finding.finding_id;
 await waitFor(async()=>{for(const w of ['worker-2','worker-3'])if(!(await api(w,'/api/v4/findings')).value.findings.some(f=>f.finding_id===finding.finding_id))return false;return true;},'affected Worker delivery');
 assert.ok(!(await api('worker-1','/api/v4/findings')).value.findings.some(f=>f.finding_id===finding.finding_id));
 for(const w of ['worker-2','worker-3']){const f=(await api(w,'/api/v4/findings')).value.findings.find(f=>f.finding_id===finding.finding_id);assert.ok(f.payload.supportingReferences.every(r=>r.entityId===entities[w]));}
 pass('Master issues a finding through Chromium; only affected Workers receive it, with entity-filtered supporting references');
 sql('master',`UPDATE sync_outbox SET acknowledged_at=NULL WHERE envelope->>'recordId'='${finding.finding_id}'`);
 await waitFor(()=>sql('master',`SELECT count(*) FROM sync_outbox WHERE envelope->>'recordId'='${finding.finding_id}' AND acknowledged_at IS NULL`)==='0','explicit finding redelivery acknowledgments');
 for(const w of ['worker-2','worker-3'])assert.equal(sql(w,`SELECT count(*) FROM local_findings WHERE finding_id='${finding.finding_id}'`),'1');
 pass('Controlled redelivery of actual finding events creates no duplicate local findings and is durably acknowledged');
 compose('stop','master-web','master-api','master-db');stopped=true;
 const page=pages['worker-2'];await page.getByRole('button',{name:'Refresh business data',exact:true}).click();const card=page.getByTestId('finding-'+finding.finding_id);await card.getByRole('button',{name:'Acknowledge finding'}).click();await card.getByText('Master status: open · Local status: acknowledged',{exact:true}).waitFor();
 assert.ok(Number(sql('worker-2',"SELECT count(*) FROM sync_outbox WHERE acknowledged_at IS NULL"))>0);
 docker(['kill','--signal=KILL',compose('ps','-q','worker-2-api')]);compose('up','-d','--wait','--wait-timeout','120','worker-2-api');assert.equal(sql('worker-2',`SELECT status FROM local_findings WHERE finding_id='${finding.finding_id}'`),'acknowledged');
 await api('worker-2','/api/v4/findings/'+finding.finding_id,'PUT',{revision:0,status:'resolved'},409);
 compose('up','-d','--wait','--wait-timeout','180','master-db','master-api','master-web');stopped=false;
 await waitFor(async()=>(await api('master','/api/v4/findings')).value.receipts.some(r=>r.finding_id===finding.finding_id&&r.entity_id===entities['worker-2']&&r.status==='acknowledged'),'finding acknowledgment upstream',120000);
 await masterPage.getByRole('button',{name:'Refresh business data',exact:true}).click();await masterPage.getByTestId('finding-'+finding.finding_id).getByRole('button',{name:'Close finding'}).click();
 await waitFor(async()=>{const f=(await api('worker-2','/api/v4/findings')).value.findings.find(f=>f.finding_id===finding.finding_id);return f.payload.status==='closed'&&f.status==='acknowledged';},'separate Master/local lifecycle revisions');
 pass('Offline finding acknowledgment survives process restart, synchronizes back to Master, rejects stale edits and survives later Master lifecycle updates');
 await page.reload({waitUntil:'networkidle'});await page.getByTestId('finding-'+finding.finding_id).waitFor();await page.screenshot({path:'artifacts/phase4-worker-finding.png',fullPage:true});await masterPage.getByRole('button',{name:'Refresh business data',exact:true}).click();await masterPage.screenshot({path:'artifacts/phase4-master-finding.png',fullPage:true});
 assert.deepEqual(pageErrors,[]);for(const i of deployment.instances)assert.equal((await json(`http://127.0.0.1:${i.apiPort}/ready`)).status,'ready');
 for(const i of deployment.instances)assert.equal(sql(i.key,'SELECT installation_id FROM platform_installation'),i.installationId);
 const preserved=JSON.parse(await readFile(process.env.STEWARD_PHASE4_BASELINE_FILE??'artifacts/phase4-preserved-baseline.json','utf8'));
 for(const i of deployment.instances)assert.deepEqual(JSON.parse(await readFile(path.join(directory,i.key,'installation.json'),'utf8')),preserved.installations[i.key]);
 for(const [worker,oldRows]of Object.entries(preserved.inventory)){
  const current=JSON.parse(moduleDb(worker,'cee.inventory',"SELECT coalesce(json_agg(r),'[]') FROM (SELECT item_id,sku,name,quantity,revision,created_at,updated_at FROM inventory_items ORDER BY item_id)r"));
  for(const row of oldRows)assert.deepEqual(current.find(r=>r.item_id===row.item_id),row);
 }
 assert.equal(digest(sql('worker-1','SELECT certificate FROM local_enrollment WHERE singleton')),preserved.enrollment['worker-1']);
 pass('Original installation configuration, enrolled Worker 1 certificate and every pre-existing Inventory record remain intact');
 pass('All installations remain healthy with their original identities; Chromium has zero uncaught errors');
 results.finishedAt=new Date().toISOString();results.entities=entities;results.records=created;results.browserPageErrors=pageErrors.length;results.runtime=compose('ps','--format','json');await writeFile('artifacts/phase4-results.json',JSON.stringify(results,null,2));
}finally{await browser.close();if(stopped)compose('up','-d','--wait','--wait-timeout','180','master-db','master-api','master-web');}
