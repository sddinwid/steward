import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,rename,rmdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {canonical,digest} from '../packages/module-sdk/dist/index.js';
import {privateDirectory} from '../tools/installer/dist/security.js';
import {directory,manifest,compose,docker} from './lib.mjs';
const action=process.argv[3]??'check',deployment=await manifest(),scenario=JSON.parse(await readFile('datasets/phase7.json','utf8'));
const base=path.join(directory,'phase7');await mkdir(base,{recursive:true});privateDirectory(base);const lock=path.join(base,'.lock');await mkdir(lock);
const marker=path.join(directory,'demo/presenter.json');if(existsSync(marker))process.env.STEWARD_SEED_CREDENTIALS_FILE=marker;
process.env.STEWARD_DEMO_RETRY_LOGIN='1';
const {api,logins,sessions,origin,waitFor}=await import('./phase4-client.mjs');
const stateFile=path.join(base,'scenario.json'),identities=deployment.instances.map(i=>({key:i.key,installationId:i.installationId}));
let state={formatVersion:1,installations:identities,generation:1,records:{},actions:{},history:[]};
if(existsSync(stateFile))state=JSON.parse(await readFile(stateFile,'utf8'));assert.deepEqual(state.installations,identities,'Scenario belongs to different installations');
async function persist(){const temporary=stateFile+'.tmp-'+randomUUID();await writeFile(temporary,JSON.stringify(state,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temporary,stateFile);}
const prefix=()=>`SYN-P7-G${String(state.generation).padStart(4,'0')}-`;
const route=(module,path)=>'/api/v3/modules/'+module+'/api'+path;
async function rows(worker,module,path){const discovery=(await api(worker,'/api/v3/modules/discovery')).value.modules.find(m=>m.moduleId===module);const paginated=discovery?.api.find(a=>a.method==='GET'&&a.path===path)?.query?.includes('offset');const result=[];let offset=0;for(;;){const value=(await api(worker,route(module,path)+(paginated?`?limit=20&offset=${offset}`:''))).value;result.push(...value.records);if(value.nextOffset==null)break;offset=value.nextOffset;assert(offset<=10000,'Scenario lookup exceeds its safe limit');}return result;}
async function create(worker,module,path,keyField,body){
 const key=[worker,module,path,body[keyField]].join('|');let entry=state.records[key];
 if(!entry){assert(!(await rows(worker,module,path)).some(r=>r[keyField]===body[keyField]),'Synthetic key already exists without ownership evidence; refusing to adopt it');entry=state.records[key]={worker,module,path,keyField,key:body[keyField],body,creationDigest:digest(canonical(body)),id:null};await persist();}
 if(!entry.id){const value=(await api(worker,route(module,path),'POST',entry.body,201)).value.record;entry.id=value.id;await persist();}
 const record=(await rows(worker,module,path)).find(r=>r.id===entry.id);assert(record,'Owned record is missing; refusing to recreate or adopt another record');return{entry,record};
}
async function transition(owned,operation){
 const e=owned.entry,key=e.id+'|'+operation;let intent=state.actions[key];if(!intent){intent=state.actions[key]={revision:owned.record.revision,requestId:randomUUID(),completed:false};await persist();}
 if(!intent.completed){await api(e.worker,route(e.module,'/'+operation+'/'+e.id),'POST',{revision:intent.revision,requestId:intent.requestId});intent.completed=true;await persist();}
 owned.record=(await rows(e.worker,e.module,e.path)).find(r=>r.id===e.id);return owned;
}
function images(){const services=deployment.instances.flatMap(i=>[i.key+'-api',i.key+'-web',...(i.role==='worker'?[i.key+'-module-host']:[])]);return Object.fromEntries(services.map(s=>[s,JSON.parse(docker(['inspect',compose('ps','-q',s)]))[0].Image]));}
function assertWorkerImages(proof){const current=images();for(const [service,image]of Object.entries(proof.coreImages))if(service.startsWith('worker-'))assert.equal(current[service],image,'Worker core image changed during module installation');return current;}
async function browserInstall(worker,module,version,configuration,proof){
 const manager=(await api(worker,'/api/v3/modules')).value,existing=manager.installed.find(m=>m.moduleId===module);if(existing?.version===version&&existing.state==='active')return;
 const otherWorkers=deployment.instances.filter(i=>i.role==='worker'&&i.key!==worker).map(i=>i.key),before={};for(const w of otherWorkers)before[w]=(await api(w,'/api/v3/modules')).value.installed;
 const browser=await chromium.launch({headless:true});try{
  const context=await browser.newContext({ignoreHTTPSErrors:true});await context.addCookies([{name:'__Host-steward',value:sessions[worker].cookie.split('=')[1],url:origin(worker),secure:true,httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin(worker));
  const packageId=module+'@'+version,card=page.getByTestId('package-'+packageId);await card.waitFor();await card.getByLabel('Configuration for '+packageId).fill(JSON.stringify(configuration));const name=manager.available.find(p=>p.packageId===packageId)?.manifest.name;assert(name,'Trusted package is missing');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/v3/modules/install')&&r.request().method()==='POST',{timeout:100000});await card.getByRole('button',{name:(existing&&['failed','installing'].includes(existing.state)?'Recover ':existing&&existing.version!==version?'Upgrade to ':'Install ')+name,exact:true}).click();const installed=await response;assert.equal(installed.status(),200,await installed.text());const request=installed.request().postDataJSON();
  // Repeat the actual browser request identity through the same authenticated API.
  await api(worker,'/api/v3/modules/install','POST',request);
  const current=(await api(worker,'/api/v3/modules')).value.installed.find(m=>m.moduleId===module);if(current.state!=='active'){const activated=page.waitForResponse(r=>r.url().endsWith('/'+module+'/lifecycle'));await page.getByRole('button',{name:'Activate '+name,exact:true}).click();assert.equal((await activated).status(),200);}
  await page.getByTestId('installed-'+module).getByText('active',{exact:true}).waitFor();assert.deepEqual(errors,[]);await page.screenshot({path:`artifacts/phase7-install-${worker}-${module}-${version}.png`,fullPage:true});proof.installations.push({worker,module,version,operationId:request.operationId,browserErrors:errors,retry:'same request identity accepted'});
 }finally{await browser.close();}
 for(const w of otherWorkers)assert.deepEqual((await api(w,'/api/v3/modules')).value.installed,before[w],'Installation changed another Worker');
 assertWorkerImages(proof);
}
async function install(){
 await logins();const proofFile=path.join(base,'installation.json'),proof=existsSync(proofFile)?JSON.parse(await readFile(proofFile,'utf8')):{startedAt:new Date().toISOString(),coreImages:images(),installations:[],initiallyAbsent:[]};
 if(!proof.initiallyAbsent.length){for(const w of ['worker-1','worker-2','worker-3']){const manager=(await api(w,'/api/v3/modules')).value;assert.equal(manager.installed.length,0,'First Phase 7 install requires a fresh demonstration deployment');proof.initiallyAbsent.push(w);}}
 try{
  // Exercise the retained Phase 6 module package and then its real migration upgrade.
  const manager=(await api('worker-1','/api/v3/modules')).value;if(!manager.installed.some(m=>m.moduleId==='cee.inventory')||manager.installed.some(m=>m.moduleId==='cee.inventory'&&m.version==='1.2.1'&&['failed','installing'].includes(m.state))){
   await browserInstall('worker-1','cee.inventory','1.2.1',{quantityUnit:'units'},proof);
  }
  if((await api('worker-1','/api/v3/modules')).value.installed.find(m=>m.moduleId==='cee.inventory')?.version==='1.2.1'){await create('worker-1','cee.inventory','/items','sku',{sku:'SYN-P7-UPGRADE',name:'Synthetic retained Phase 6 item',quantity:7,reservedQuantity:0});
  }
  await browserInstall('worker-1','cee.inventory','1.3.2',{quantityUnit:'units',integrationsEnabled:true},proof);assert((await rows('worker-1','cee.inventory','/items')).some(r=>r.sku==='SYN-P7-UPGRADE'&&r.quantity===7));
  for(const module of ['cee.procurement','cee.sales'])await browserInstall('worker-1',module,'1.0.2',{currency:scenario.currency,integrationsEnabled:true},proof);
  await browserInstall('worker-1','cee.workforce','1.0.2',{currency:scenario.currency,integrationsEnabled:false,syntheticOnly:true,minimumGroupSize:3},proof);
  execFileSync(process.execPath,['scripts/seed-phase4.mjs',directory],{stdio:'inherit',timeout:600000,env:{...process.env,STEWARD_SEED_CREDENTIALS_FILE:marker}});
  await logins();await browserInstall('worker-2','cee.procurement','1.0.2',{currency:scenario.currency,integrationsEnabled:false},proof);
  await browserInstall('worker-2','cee.sales','1.0.2',{currency:scenario.currency,integrationsEnabled:false},proof);
  const owner=(await api('worker-3','/api/v2/worker/status')).value.entityId;
  await browserInstall('worker-3','cee.assets','1.0.3',{currency:scenario.currency,integrationsEnabled:false,authorizedOwnerEntityIds:[owner]},proof);
  await browserInstall('worker-1','cee.assets','1.0.3',{currency:scenario.currency,integrationsEnabled:false,authorizedOwnerEntityIds:[owner]},proof);
  await browserInstall('worker-3','cee.workforce','1.0.2',{currency:scenario.currency,integrationsEnabled:false,syntheticOnly:true,minimumGroupSize:3},proof);
  for(const w of ['worker-2','worker-3'])assert(!(await api(w,'/api/v3/modules')).value.installed.some(m=>m.moduleId==='cee.inventory'));
  proof.finalCoreImages=assertWorkerImages(proof);proof.finishedAt=new Date().toISOString();proof.status='passed';console.log('PASS browser installation, retained Inventory migration, safe request retries, Worker isolation and unchanged Worker core images');
 }finally{await writeFile(proofFile,JSON.stringify(proof,null,2)+'\n');}
}
async function seed(){
 await logins();const p=prefix(),entities={};for(const w of ['worker-1','worker-2','worker-3']){const s=(await api(w,'/api/v2/worker/status')).value;assert.equal(s.enrollmentState,'enrolled');entities[w]=s.entityId;}
 for(const demand of scenario.procurement){const module='cee.procurement';await create(demand.worker,module,'/suppliers','code',{code:p+'VENDOR',name:demand.supplierName,relationship:'external'});const req=await create(demand.worker,module,'/requisitions','number',{number:p+'REQ',supplierCode:p+'VENDOR',sku:scenario.sku,quantity:demand.quantity,reason:scenario.description,currency:scenario.currency,unitPriceCents:demand.unitPriceCents,shippingCents:demand.shippingCents,transitionCents:demand.transitionCents});await transition(req,'publish-demand');}
 const q=scenario.quote,quote=await create(q.worker,'cee.procurement','/quotes','number',{number:p+'QUOTE',supplierCode:p+'VENDOR',sku:scenario.sku,minimumQuantity:q.minimumQuantity,unitPriceCents:q.unitPriceCents,shippingCents:q.shippingCents,currency:scenario.currency,validUntil:new Date(Date.now()+q.validDays*86400000).toISOString()});await transition(quote,'publish-quote');
 const a=scenario.asset,relations={ownerEntityId:entities[a.worker],custodianEntityId:entities[a.userWorker],userEntityId:entities[a.userWorker],accessBasis:'leased'};
 await create(a.worker,'cee.assets','/facilities','code',{code:p+'FACILITY',name:a.name,site:a.site,classification:'warehouse',...relations});const asset=await create(a.worker,'cee.assets','/assets','code',{code:p+'ASSET',name:a.name,facilityCode:p+'FACILITY',site:a.site,classification:'warehouse',...relations,capacityM3:a.capacityM3,utilizedM3:a.utilizedM3,availability:'available',monthlyOperatingCostCents:a.monthlyOperatingCostCents,currency:scenario.currency});await transition(asset,'publish');
 const d=scenario.storageDemand;await create(d.worker,'cee.operations','/storage','name',{name:p+'external storage',site:a.site,required_m3:d.requiredM3,utilized_m3:d.utilizedM3,monthly_external_cost:d.monthlyExternalCost,currency:scenario.currency});
 const factory=scenario.manufacturingAssets,access={ownerEntityId:entities[factory.ownerWorker],custodianEntityId:entities[factory.worker],userEntityId:entities[factory.worker],accessBasis:'leased'};
 await create(factory.worker,'cee.assets','/facilities','code',{code:p+'FACTORY',name:factory.facilityName,site:factory.site,classification:'workshop',...access});await create(factory.worker,'cee.assets','/assets','code',{code:p+'EQUIPMENT',name:factory.equipmentName,facilityCode:p+'FACTORY',site:factory.site,classification:'equipment',...access,capacityM3:0,utilizedM3:0,availability:'available',monthlyOperatingCostCents:factory.monthlyOperatingCostCents,currency:scenario.currency});await create(factory.worker,'cee.assets','/maintenance','number',{number:p+'MAINTENANCE',assetCode:p+'EQUIPMENT',description:'Synthetic scheduled equipment inspection',startsAt:new Date(Date.now()+7*86400000).toISOString(),endsAt:new Date(Date.now()+8*86400000).toISOString(),costCents:factory.maintenanceCostCents});
 const w=scenario.workforce,skillCode=w.skillCode+'-G'+String(state.generation).padStart(4,'0');let trainingSkill;
 for(const worker of [w.trainingWorker,w.demandWorker]){const skill=await create(worker,'cee.workforce','/skills','code',{code:skillCode,name:w.skillName,classification:'operational'});if(worker===w.trainingWorker)trainingSkill=skill;}
 const program=await create(w.trainingWorker,'cee.workforce','/programs','code',{code:p+'PROGRAM',name:w.programName,skillCode,seats:w.seats,site:w.site,startsAt:new Date(Date.now()-30*86400000).toISOString(),endsAt:new Date(Date.now()+30*86400000).toISOString()});
 for(let n=1;n<=w.syntheticPeople;n++){const ref=p+n;await create(w.trainingWorker,'cee.workforce','/people','reference',{reference:ref,displayName:'Synthetic Person G'+state.generation+' '+n,skills:[],availabilityUnits:1});const enrollment=await create(w.trainingWorker,'cee.workforce','/enrollments','number',{number:p+'ENROLLMENT-'+n,personRef:ref,programCode:program.record.code});await transition(enrollment,'complete');}
 await create(w.trainingWorker,'cee.workforce','/positions','code',{code:p+'LOCAL-JOB',title:w.localPositionTitle,requiredSkills:[skillCode],openings:1,site:w.site,status:'open'});
 await transition(trainingSkill,'publish-skills');await transition(program,'publish-program');const position=await create(w.demandWorker,'cee.workforce','/positions','code',{code:p+'JOB',title:w.skillName+' opportunity',requiredSkills:[skillCode],openings:w.openings,site:w.site,status:'open'});await transition(position,'publish-position');
 await workflow();await standaloneSale();state.seededAt=new Date().toISOString();state.entities=entities;await persist();await waitFor(async()=>{const r=(await api('master','/api/v4/analytics')).value.records;return r.some(v=>v.module_id==='cee.assets'&&v.record_id===asset.entry.id)&&r.some(v=>v.stream_id==='procurement_quotes'&&v.record_id===quote.entry.id)&&r.some(v=>v.stream_id==='workforce_supply'&&v.record_id===trainingSkill.entry.id);},'Phase 7 canonical projections');console.log('PASS owned synthetic scenario, approved projections and real module workflows seeded; reruns preserve existing records');
}
async function standaloneSale(){const worker='worker-2',p=prefix();assert(!(await api(worker,'/api/v3/modules')).value.installed.some(m=>m.moduleId==='cee.inventory'),'Standalone demonstration requires Inventory to remain absent');await create(worker,'cee.sales','/customers','code',{code:p+'LOCAL-CUSTOMER',name:'Synthetic standalone customer',reference:p+'LOCAL-CUSTOMER'});const order=await create(worker,'cee.sales','/orders','number',{number:p+'LOCAL-SALE',customerCode:p+'LOCAL-CUSTOMER',currency:scenario.currency,lines:[{sku:scenario.sku,quantity:2,unitPriceCents:100}]});await transition(order,'confirm');const fulfillment=await create(worker,'cee.sales','/fulfillments','number',{number:p+'LOCAL-FULFILLMENT',orderNumber:order.record.number,lines:[{sku:scenario.sku,quantity:2}]});assert.equal(fulfillment.record.status,'completed');assert.equal((await rows(worker,'cee.sales','/orders')).find(r=>r.id===order.entry.id).status,'fulfilled');state.standaloneSale={worker,orderId:order.entry.id,inventoryAbsent:true};await persist();}
async function workflow(){
 const p=prefix(),c=scenario.workflow,worker=c.worker,sku=scenario.sku+'-G'+state.generation;state.workflow??={};if(state.workflow.completed)return;
 await create(worker,'cee.inventory','/items','sku',{sku,name:scenario.description,quantity:c.initialStock,reservedQuantity:0,minStock:c.threshold});await create(worker,'cee.sales','/customers','code',{code:p+'CUSTOMER',name:'Synthetic business customer',reference:p+'CUSTOMER'});
 const orders=[];for(let n=1;n<=2;n++){const order=await create(worker,'cee.sales','/orders','number',{number:p+'SALE-'+n,customerCode:p+'CUSTOMER',currency:scenario.currency,lines:[{sku,quantity:c.orderQuantity,unitPriceCents:c.unitPriceCents}]});await transition(order,'confirm');orders.push(order);}
 if(!state.workflow.large){const reserved=await waitFor(async()=>{const all=await rows(worker,'cee.sales','/orders');const selected=orders.map(o=>all.find(r=>r.id===o.entry.id));return selected.every(r=>r.stockStatus==='reserved')?selected:false;},'partial concurrent reservations');assert.equal(reserved.reduce((n,r)=>n+r.reserved[sku],0),c.initialStock);state.workflow.large=reserved.find(r=>r.reserved[sku]===c.orderQuantity).id;state.workflow.small=reserved.find(r=>r.reserved[sku]!==c.orderQuantity).id;state.workflow.reservations=reserved.map(r=>({id:r.id,reserved:r.reserved[sku]}));await persist();}
 const large=orders.find(o=>o.entry.id===state.workflow.large),small=orders.find(o=>o.entry.id===state.workflow.small);large.record=(await rows(worker,'cee.sales','/orders')).find(r=>r.id===large.entry.id);await transition(large,'cancel');await waitFor(async()=>(await rows(worker,'cee.sales','/orders')).find(r=>r.id===large.entry.id).stockStatus==='released','ordered cancellation release');
 const quantity=c.initialStock-c.orderQuantity;const fulfillment=await create(worker,'cee.sales','/fulfillments','number',{number:p+'FULFILLMENT',orderNumber:small.record.number,lines:[{sku,quantity}]});await waitFor(async()=>(await rows(worker,'cee.sales','/fulfillments')).find(r=>r.id===fulfillment.entry.id).status==='completed','authoritative stock consumption');
 const po=await create(worker,'cee.procurement','/orders','number',{number:p+'PO',supplierCode:p+'VENDOR',lines:[{sku,quantity:c.purchaseQuantity,unitPriceCents:c.purchasePriceCents}],shippingCents:0,currency:scenario.currency});for(const operation of ['submit','approve','place'])await transition(po,operation);
 for(const [n,quantity]of [[1,3],[2,c.purchaseQuantity-3]]){const receipt=await create(worker,'cee.procurement','/receipts','number',{number:p+'RECEIPT-'+n,orderNumber:po.record.number,lines:[{sku,quantity}]});await waitFor(async()=>(await rows(worker,'cee.procurement','/receipts')).find(r=>r.id===receipt.entry.id).stockStatus==='applied','durable goods receipt');}
 const stock=(await rows(worker,'cee.inventory','/items')).find(r=>r.sku===sku);assert.equal(stock.quantity,c.initialStock-quantity+c.purchaseQuantity);assert.equal(stock.reservedQuantity,0);const requisitions=await rows(worker,'cee.procurement','/requisitions');assert(requisitions.some(r=>r.sku===sku&&r.status==='draft'&&r.sourceEvent));state.workflow.completed=true;state.workflow.stock=stock;await persist();
}
async function check(){await logins();const proof=JSON.parse(await readFile(path.join(base,'installation.json'),'utf8'));assertWorkerImages(proof);for(const w of ['worker-1','worker-2','worker-3'])assert.equal((await api(w,'/api/v2/worker/status')).value.enrollmentState,'enrolled');assert(state.seededAt,'Scenario is not seeded');const a=(await api('master','/api/v4/analytics')).value;assert(!a.records.filter(r=>['workforce_supply','training_metrics','workforce_demand'].includes(r.stream_id)).some(r=>/"personRef"|"displayName"|"candidateReference"/.test(JSON.stringify(r.payload))));console.log('PASS three enrollments, unchanged core images, owned scenario and aggregate-only workforce synchronization');}
async function reset(){
 await logins();const retired=[];
 for(const entry of Object.values(state.records)){if(!entry.id||!String(entry.key).startsWith(prefix()))continue;const record=(await rows(entry.worker,entry.module,entry.path)).find(r=>r.id===entry.id);assert(record,'Owned reset record is missing');const owned={entry,record};
  const operation=entry.module==='cee.procurement'&&entry.path==='/requisitions'&&record.status==='approved'?'withdraw-demand':entry.module==='cee.procurement'&&entry.path==='/quotes'&&record.status==='approved'?'withdraw-quote':entry.module==='cee.assets'&&entry.path==='/assets'&&record.status==='published'?'withdraw':entry.module==='cee.workforce'&&entry.path==='/skills'?'withdraw-skills':entry.module==='cee.workforce'&&entry.path==='/programs'?'withdraw-program':entry.module==='cee.workforce'&&entry.path==='/positions'?'withdraw-position':null;
  if(operation){await transition(owned,operation);retired.push(entry.id);}
  if(entry.module==='cee.sales'&&entry.path==='/orders'&&['draft','confirmed','partially_fulfilled'].includes(record.status))await transition(owned,'cancel');
  if(entry.module==='cee.operations'&&entry.path==='/storage'&&record.monthly_external_cost!==0)await api(entry.worker,route(entry.module,entry.path+'/'+entry.id),'PUT',{...entry.body,monthly_external_cost:0,revision:record.revision});
 }
 const ownedIds=new Set(Object.values(state.records).map(r=>r.id).filter(Boolean)),closedFindings=[];for(const f of (await api('master','/api/v4/findings')).value.findings){if(f.status==='open'&&f.supporting_references.length&&f.supporting_references.every(r=>ownedIds.has(r.recordId))){await api('master','/api/v4/findings/'+f.finding_id,'PUT',{revision:f.revision,status:'closed'});closedFindings.push(f.finding_id);}}
 state.history.push({generation:state.generation,retiredAt:new Date().toISOString(),retired,closedFindings,records:state.records,actions:state.actions});state.generation++;state.records={};state.actions={};delete state.workflow;delete state.seededAt;await persist();console.log('Retired only owned synthetic projections, eligible open orders and findings supported entirely by owned records. Credentials, identities, configuration and all business audit history retained.');await seed();
}
try{
 if(action==='install')await install();else if(action==='seed')await seed();else if(action==='check'||action==='preflight')await check();else if(action==='reset')await reset();else if(action==='ai'){
  await check();for(const capability of ['shared-procurement','workforce-opportunity','resource-sharing'])execFileSync(process.execPath,['scripts/verify-ollama-provider.mjs',directory],{stdio:'inherit',timeout:900000,env:{...process.env,STEWARD_ANALYST_CAPABILITY:capability,STEWARD_OLLAMA_DEFER_PUBLICATION:'1',STEWARD_ANALYST_PROMPT:JSON.parse(await readFile('datasets/phase7-investigations.json','utf8'))[capability].prompt,STEWARD_OLLAMA_REPORT:'artifacts/phase7-ollama-'+capability+'.json'}});
 }else throw Error('Usage: node scripts/demo-phase7.mjs DEPLOYMENT install|seed|check|reset|ai');
}finally{await rmdir(lock);}
