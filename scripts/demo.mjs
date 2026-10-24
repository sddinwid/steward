import {moduleNavigation,openWorkspace,fillAdvancedJson} from './ui-navigation.mjs';
// Presenter automation uses the same TLS, authentication and enrollment APIs as the UI.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,rmdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {directory,manifest,compose,docker,json} from './lib.mjs';
const action=process.argv[3]??'check',deployment=await manifest();
const base=path.join(directory,'demo'),marker=path.join(base,'presenter.json');
const run=(script)=>execFileSync(process.execPath,[script,directory],{stdio:'inherit',timeout:900000,env:{...process.env,STEWARD_SEED_CREDENTIALS_FILE:marker}});
const keys=['master','worker-1','worker-2','worker-3'];
assert.deepEqual(deployment.instances.map(i=>i.key),keys,'Demo runner requires Master and exactly three Workers');
await mkdir(base,{recursive:true,mode:0o700});
const {privateDirectory}=await import('../tools/installer/dist/security.js');privateDirectory(base);
const lock=path.join(base,'.lock');await mkdir(lock);
let client;
async function connect(){process.env.STEWARD_SEED_CREDENTIALS_FILE=marker;process.env.STEWARD_DEMO_RETRY_LOGIN='1';client??=await import('./phase4-client.mjs');await client.logins();return client;}
const identities=deployment.instances.map(i=>i.installationId);
async function presenter(){const p=JSON.parse(await readFile(marker,'utf8'));assert.deepEqual(p.installations,identities,'Demo state belongs to different installations');return p;}
async function preflight(){
 assert.ok(Number(process.versions.node.split('.')[0])===24,'Node 24 is required');
 docker(['info','--format','{{.ServerVersion}}']);
 execFileSync(process.env.STEWARD_OPENSSL??(process.platform==='win32'?path.join(process.env.ProgramFiles??'C:/Program Files','Git/usr/bin/openssl.exe'):'openssl'),['version'],{stdio:'pipe'});
 for(const i of deployment.instances){await json(`http://127.0.0.1:${i.apiPort}/health`);await json(`http://127.0.0.1:${i.apiPort}/ready`);const r=await fetch(`http://127.0.0.1:${i.webPort}/`,{signal:AbortSignal.timeout(5000)});assert.ok(r.ok,i.key+' frontend unavailable');}
 let model='unavailable';try{const r=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(4000)});const tags=await r.json();model=tags.models.some(m=>m.name===(process.env.STEWARD_OLLAMA_MODEL??'qwen2.5:7b'))?'installed, unloaded until requested':'not installed; install qwen2.5:7b before the AI segment';}catch{model='Ollama unreachable at 127.0.0.1:11434; start Ollama before the AI segment';}
 console.log('PASS Node, OpenSSL, Docker and all four API/frontends; Ollama: '+model);
 return model;
}
async function setup(){
 await preflight();
 if(!existsSync(marker)){
  // Never appropriate an operator deployment. This is an explicit dedicated-demo bootstrap.
  for(const key of keys)assert.equal(compose('exec','-T',key+'-db','psql','-U','postgres','-d','steward','-At','-c','SELECT count(*) FROM security_accounts'),'0','Demo setup requires fresh accounts; existing credentials are preserved');
  for(const key of keys)assert.equal(compose('exec','-T',key+'-db','psql','-U','postgres','-d','steward','-At','-c','SELECT (SELECT count(*) FROM module_installations)+(SELECT count(*) FROM local_enrollment)+(SELECT count(*) FROM enrolled_workers)+(SELECT count(*) FROM worker_candidates)+(SELECT count(*) FROM analytical_records)+(SELECT count(*) FROM analytical_findings)'),'0','Demo setup requires a fresh installation; existing operational state is preserved');
  assert.equal(compose('exec','-T','master-db','psql','-U','postgres','-d','steward','-At','-c','SELECT count(*) FROM legal_entities WHERE entity_id<>(SELECT entity_id FROM platform_installation WHERE singleton)'),'0','Existing legal entities require a separate fresh demo deployment');
  const suffix=randomBytes(4).toString('hex'),p={version:1,installations:identities,entityA:randomUUID(),entityB:randomUUID(),accounts:{}};
  for(const name of ['registry','enroller','viewer','worker-1','worker-2','worker-3'])p.accounts[name]={username:'presenter-'+name+'-'+suffix,password:randomBytes(32).toString('base64url')};
  await writeFile(marker,JSON.stringify(p,null,2)+'\n',{flag:'wx',mode:0o600});
 }
 const p=await presenter();
 for(const [name,account]of Object.entries(p.accounts)){
  const key=name.startsWith('worker-')?name:'master',role=name==='registry'?'registry_admin':name==='enroller'?'enrollment_admin':name==='viewer'?'viewer':'local_admin';
  assert.match(account.username,/^presenter-[a-z0-9-]+$/);
  const count=compose('exec','-T',key+'-db','psql','-U','postgres','-d','steward','-At','-c',"SELECT count(*) FROM security_accounts WHERE username='"+account.username+"'");
  if(count==='0'){
   // Password goes directly to stdin; it is never included in argv or console output.
   const args=['compose',...['compose.yaml','security/compose.yaml','modules/compose.yaml','data/compose.yaml','analyst/compose.yaml',...(existsSync(path.join(directory,'release/compose.yaml'))?['release/compose.yaml']:[])].flatMap(f=>['-f',path.join(directory,f)]),'exec','-T',key+'-api','node','packages/platform/dist/security/admin-cli.js','--username',account.username,'--role',role,'--password-stdin'];
   execFileSync('docker',args,{input:account.password+'\n',stdio:['pipe','pipe','pipe'],timeout:30000});
  }
 }
 const {api,sessions,waitFor,login}=await connect();
 const company=JSON.parse(await readFile('datasets/phase4.json','utf8')).companies.find(c=>c.worker==='worker-1');assert.ok(company);
 await api('master','/api/v2/entities','PUT',{entityId:p.entityA,name:company.name,classification:company.role,enrollmentEligible:true});
 const enroller=await login('master',p.accounts.enroller);await login('master',p.accounts.registry);
 for(const accountId of [sessions.master.account.account_id,enroller.account.account_id])await api('master','/api/v2/authorizations','PUT',{accountId,entityId:p.entityA,allowed:true});
 let state=(await api('worker-1','/api/v2/worker/status')).value;
 if(state.enrollmentState!=='enrolled'){
  await api('worker-1','/api/v2/worker/connection','PUT',{profileId:'master'});
  if(state.enrollmentState!=='pending')await api('worker-1','/api/v2/worker/start','POST',{requestId:randomUUID()});
  state=await waitFor(async()=>{const s=(await api('worker-1','/api/v2/worker/status')).value;return s.userCode?s:false;},'trusted authorization code');
  await api('master','/api/v2/enrollment/authorize','POST',{code:state.userCode,entityId:p.entityA});
  await api('master','/api/v2/enrollment/decision','POST',{requestId:state.requestId,entityId:p.entityA,decision:'approve'});
  await waitFor(async()=>(await api('worker-1','/api/v2/worker/status')).value.enrollmentState==='enrolled','enrollment');
 }
 assert.equal((await api('worker-1','/api/v2/worker/status')).value.entityId,p.entityA);
 console.log('PASS private presenter accounts, registered manufacturer, explicit scoped authorization and trusted enrollment. Credentials: '+marker+' (never share this file).');
}
async function moduleDemo(){
 await presenter();const {api,origin,credentials}=await connect();
 const {chromium}=await import('playwright'),browser=await chromium.launch({headless:true}),errors=[];
 const snapshots=()=>Object.fromEntries(deployment.instances.filter(i=>i.role==='worker').map(i=>[i.key,JSON.parse(docker(['inspect',compose('ps','-q',i.key+'-api')]))[0].Image]));
 const before=snapshots(),manager=(await api('worker-1','/api/v3/modules')).value;
 const initial=manager.installed.some(m=>m.moduleId==='cee.inventory');
 try{
  if(!existsSync(path.join(base,'module-evidence.json'))){
   assert.equal(initial,false,'Initial absence must be demonstrated on a fresh Worker');
   for(const key of ['worker-2','worker-3'])assert.equal((await api(key,'/api/v3/modules')).value.installed.some(m=>m.moduleId==='cee.inventory'),false);
   await api('worker-1','/api/v3/modules/cee.inventory/api/items','GET',undefined,404);
   await writeFile(path.join(base,'module-evidence.json'),JSON.stringify({verifiedAt:new Date().toISOString(),initiallyAbsent:true,browserInstalled:false,worker2And3InitiallyAbsent:true,coreImages:before},null,2)+'\n',{flag:'wx'});
  }
  const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
  await page.goto(origin('worker-1'));await page.getByLabel('Username',{exact:true}).fill(credentials.accounts['worker-1'].username);await page.getByLabel('Password',{exact:true}).fill(credentials.accounts['worker-1'].password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await openWorkspace(page,'/administration/modules');await page.getByRole('heading',{name:'Module Manager',exact:true,level:2}).waitFor();
  if(!initial){
   const card=page.getByTestId('package-cee.inventory@1.2.1');await fillAdvancedJson(card,'Configuration for cee.inventory@1.2.1','{"quantityUnit":"units"}');
   const response=page.waitForResponse(r=>r.url().endsWith('/api/v3/modules/install')&&r.request().method()==='POST',{timeout:100000});await card.getByRole('button',{name:'Install Inventory',exact:true}).click();assert.equal((await response).status(),200);
  }
  if((await api('worker-1','/api/v3/modules')).value.installed.find(m=>m.moduleId==='cee.inventory').state!=='active'){
   const r=page.waitForResponse(r=>r.url().endsWith('/cee.inventory/lifecycle'));await page.getByRole('button',{name:'Activate Inventory',exact:true}).click();assert.equal((await r).status(),200);
  }
  await moduleNavigation(page).getByRole('button',{name:'Inventory',exact:true}).click();const screen=page.getByTestId('module-screen-cee.inventory');
  const rows=(await api('worker-1','/api/v3/modules/cee.inventory/api/items')).value.records;
  if(!rows.some(r=>r.sku==='DEMO-MODULE-001')){
   await screen.getByLabel('SKU',{exact:true}).fill('DEMO-MODULE-001');await screen.getByLabel('Item name',{exact:true}).fill('Synthetic module demonstration');await screen.getByLabel('Quantity',{exact:true}).fill('12');await screen.getByLabel('Reserved quantity',{exact:true}).fill('0');
   const r=page.waitForResponse(r=>r.url().endsWith('/api/items')&&r.request().method()==='POST');await screen.getByRole('button',{name:'Create record',exact:true}).click();assert.equal((await r).status(),201);
  }
  await screen.getByText('DEMO-MODULE-001',{exact:true}).waitFor();await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/phase6-inventory.png',fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(snapshots(),before);
  const evidence=JSON.parse(await readFile(path.join(base,'module-evidence.json'),'utf8'));assert.deepEqual(before,evidence.coreImages);
  await writeFile(path.join(base,'module-evidence.json'),JSON.stringify({...evidence,verifiedAt:new Date().toISOString(),browserInstalled:true,coreUnchanged:true,browserErrors:errors},null,2)+'\n');
  console.log('PASS running Module Manager installation, real browser Inventory creation, independent Workers and unchanged core images.');
 }finally{await browser.close();}
}
async function seed(){
 await presenter();const {api}=await connect(),ledgerFile=path.join(base,'owned-records.json');
 if(!existsSync(ledgerFile)){
  // Refuse name-based adoption into the reset ownership ledger.
  for(const key of ['worker-1','worker-2','worker-3']){
   const m=(await api(key,'/api/v3/modules')).value;
   if(m.installed.some(m=>m.moduleId==='cee.operations'))for(const stream of ['capacities','storage','assets'])assert.equal((await api(key,'/api/v3/modules/cee.operations/api/'+stream)).value.records.length,0,'First demo seed requires empty Operations; existing data preserved');
  }
  if((await api('worker-1','/api/v3/modules')).value.installed.some(m=>m.moduleId==='cee.inventory'))assert.ok(!(await api('worker-1','/api/v3/modules/cee.inventory/api/items')).value.records.some(r=>r.sku==='SYNTHETIC-FG-001'),'Synthetic SKU already exists without ownership evidence');
 }
 run('scripts/seed-phase4.mjs');
 const state=JSON.parse(await readFile(path.join(directory,'data/scenario-state.json'),'utf8'));
 if(!existsSync(ledgerFile))await writeFile(ledgerFile,JSON.stringify({version:1,installations:identities,records:state.records},null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('PASS idempotent business scenario; reset ownership ledger recorded without credentials.');
}
async function reset(){
 await presenter();const {api,waitFor}=await connect(),ledger=JSON.parse(await readFile(path.join(base,'owned-records.json'),'utf8'));
 assert.deepEqual(ledger.installations,identities);const scenario=JSON.parse(await readFile('datasets/phase4.json','utf8')),updated=[];
 for(const company of scenario.companies)for(const record of company.records){
  const {path:stream,seedKey,...body}=record,id=ledger.records[company.worker+'/'+seedKey];assert.ok(id,'Missing owned record');
  const route='/api/v3/modules/cee.operations/api/'+stream,current=(await api(company.worker,route)).value.records.find(r=>r.id===id);assert.ok(current,'Owned record missing; refusing to recreate/adopt a different record');
  if(Object.entries(body).some(([k,v])=>current[k]!==v))updated.push({worker:company.worker,record:(await api(company.worker,route+'/'+id,'PUT',{...body,revision:current.revision})).value.record});
 }
 const route='/api/v3/modules/cee.inventory/api/items',id=ledger.records.inventory,current=(await api('worker-1',route)).value.records.find(r=>r.id===id);assert.ok(current,'Owned Inventory record missing');
 if(Object.entries(scenario.inventory).some(([k,v])=>current[k]!==v))updated.push({worker:'worker-1',record:(await api('worker-1',route+'/'+id,'PUT',{...scenario.inventory,revision:current.revision})).value.record});
 await waitFor(async()=>{const rows=(await api('master','/api/v4/analytics')).value.records;return updated.every(v=>rows.some(r=>r.installation_id===deployment.instances.find(i=>i.key===v.worker).installationId&&r.record_id===v.record.id&&Number(r.revision)===v.record.revision));},'reset revisions synchronized');
 console.log('PASS reset only ledger-owned synthetic fields via revision-checked APIs; identities, credentials, unrelated records and audit/history retained. Updated '+updated.length+' records.');
}
async function check(){
 const ollama=await preflight();await presenter();const {api}=await connect(),states={};
 for(const key of keys.filter(k=>k!=='master')){
  const s=(await api(key,'/api/v2/worker/status')).value;assert.equal(s.enrollmentState,'enrolled',key+' must be enrolled');
  const modules=(await api(key,'/api/v3/modules')).value.installed;assert.ok(modules.some(m=>m.moduleId==='cee.operations'&&m.state==='active'),key+' Operations unavailable');
  states[key]={enrollment:s.enrollmentState,entityId:s.entityId,modules:modules.map(m=>({moduleId:m.moduleId,version:m.version,state:m.state}))};
 }
 const report={verifiedAt:new Date().toISOString(),ollama,states};await writeFile(path.join(base,'check.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS three independent enrollments and Operations modules. Inventory is required on Worker 1 only.');
 assert.ok(states['worker-1'].modules.some(m=>m.moduleId==='cee.inventory'&&m.state==='active'));
 return report;
}
async function outage(){
 await presenter();const {api,waitFor}=await connect(),ledger=JSON.parse(await readFile(path.join(base,'owned-records.json'),'utf8'));assert.deepEqual(ledger.installations,identities);
 const id=ledger.records['worker-1/manufacturing-1'],route='/api/v3/modules/cee.operations/api/capacities';assert.ok(id);
 const original=(await api('worker-1',route)).value.records.find(r=>r.id===id);assert.ok(original);
 let record;const started=Date.now();
 try{
  compose('stop','master-web','master-api','master-db');
  const {id:_,available_m3:__,...body}=original;
  record=(await api('worker-1',route+'/'+id,'PUT',{...body,monthly_operating_cost:original.monthly_operating_cost+1})).value.record;
  compose('restart','worker-1-api');compose('up','--no-build','-d','--wait','--wait-timeout','120','worker-1-api');
  assert.equal((await api('worker-1',route)).value.records.find(r=>r.id===id).revision,record.revision);
  for(const i of deployment.instances.filter(i=>i.role==='worker'))await json(`http://127.0.0.1:${i.apiPort}/ready`);
 }finally{compose('up','--no-build','-d','--wait','--wait-timeout','180','master-db','master-api','master-web');}
 await waitFor(async()=>(await api('master','/api/v4/analytics')).value.records.some(r=>r.record_id===id&&Number(r.revision)===record.revision&&Number(r.payload.monthly_operating_cost)===record.monthly_operating_cost),'durable outage change',120000);
 await writeFile(path.join(base,'outage.json'),JSON.stringify({verifiedAt:new Date().toISOString(),masterStackStopped:true,workerRestartedOffline:true,allWorkersReady:true,recordId:id,revision:record.revision,synchronized:true,elapsedMs:Date.now()-started},null,2)+'\n');
 console.log('PASS committed synthetic change and enrollment survive Worker restart during full Master outage; durable synchronization catches up after reconnect. Run reset to restore scenario fields.');
}
async function acknowledge(){
 await presenter();const {api,waitFor}=await connect(),report=JSON.parse(await readFile(path.join(base,'live-ai.json'),'utf8'));assert.equal(report.investigationStatus,'completed');
 const receipts=[];
 for(const d of report.deliveries.filter(d=>d.affected)){
  const f=(await api(d.worker,'/api/v4/findings')).value.findings.find(f=>f.finding_id===report.findingId);assert.ok(f);
  if(f.status!=='acknowledged')await api(d.worker,'/api/v4/findings/'+report.findingId,'PUT',{revision:f.revision,status:'acknowledged'});
  const entityId=(await api(d.worker,'/api/v2/worker/status')).value.entityId;
  await waitFor(async()=>(await api('master','/api/v4/findings')).value.receipts.some(r=>r.finding_id===report.findingId&&r.entity_id===entityId&&r.status==='acknowledged'),'affected Worker receipt');receipts.push({worker:d.worker,entityId,status:'acknowledged'});
 }
 await writeFile(path.join(base,'acknowledgments.json'),JSON.stringify({verifiedAt:new Date().toISOString(),findingId:report.findingId,receipts},null,2)+'\n');console.log('PASS actual affected Workers acknowledge the live-model finding through durable synchronization.');
}
try{
 if(action==='setup')await setup();else if(action==='module')await moduleDemo();else if(action==='seed')await seed();else if(action==='reset')await reset();else if(action==='check')await check();else if(action==='preflight')await preflight();else if(action==='outage')await outage();else if(action==='acknowledge')await acknowledge();
 else if(action==='ai'){
  const readiness=await check();assert.ok(readiness.ollama.startsWith('installed'),'Local model unavailable: '+readiness.ollama);run('scripts/verify-ollama-provider.mjs');
  const report=JSON.parse(await readFile('artifacts/phase5-ollama-provider.json','utf8'));assert.equal(report.investigationStatus,'completed');assert.equal(report.configurationRestored,true);assert.equal(report.modelUnloaded,true);
  await writeFile(path.join(base,'live-ai.json'),JSON.stringify(report,null,2)+'\n');console.log('Real investigation persisted. Review its narrative and explicit assumptions in Master; automated wire/math validation does not replace presenter review.');
 }else throw new Error('Usage: node scripts/demo.mjs DEPLOYMENT preflight|setup|module|seed|reset|check|outage|ai|acknowledge');
}catch(e){console.error('Demo stopped: '+e.message+'. Existing configuration/data retained; see docs/phase6-presenter.md for recovery.');process.exitCode=1;}
finally{await rmdir(lock);}
