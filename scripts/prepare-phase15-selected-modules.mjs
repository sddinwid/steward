// Selected-operator preparation only. No mutation without --execute-authorized.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {canonical,digest,verifyPackage} from '../packages/module-sdk/dist/index.js';
import {activatePreparedModule} from './phase15-module-lifecycle.mjs';
const root=process.cwd(),{values}=parseArgs({options:{mode:{type:'string'},'execute-authorized':{type:'boolean',default:false},'include-connectors':{type:'boolean',default:false}}});
assert(['upgrade-local','upgrade-connectors','governance','reviewers'].includes(values.mode),'Select --mode upgrade-local|upgrade-connectors|governance|reviewers');
const selection=JSON.parse(await fs.readFile('.steward/operator/selection.json','utf8')),directory=path.resolve(selection.directory);
if(!values['execute-authorized']){console.log(JSON.stringify({executed:false,mode:values.mode,directory,requires:'--execute-authorized after root review',scope:'W3 upgrades; additive reviewed local governance; no W1/W2 provider changes'}));process.exit(0);}
process.argv[2]=directory;
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');
const {api,logins,installed,waitFor,migrationCompatible}=await import('./phase13-acceptance-client.mjs');
const deployment=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
assert.equal(deployment.project,selection.project);
const ledgerFile=path.join(directory,'demo/phase15-selected-modules.json'),lock=ledgerFile+'.lock';
await fs.mkdir(path.dirname(ledgerFile),{recursive:true,mode:0o700});await fs.mkdir(lock);
try{
const identity=deployment.instances.filter(w=>w.role==='worker').map(w=>({key:w.key,installationId:w.installationId}));
const state=existsSync(ledgerFile)?JSON.parse(await fs.readFile(ledgerFile,'utf8')):{version:1,identity,upgrades:{},governance:null};
assert.equal(state.version,1);assert.equal(canonical(state.identity),canonical(identity),'Selected Worker identities changed');
const persist=async()=>{const temporary=ledgerFile+'.'+randomUUID()+'.tmp';await fs.writeFile(temporary,JSON.stringify(state,null,2)+'\n',{mode:0o600});await fs.rename(temporary,ledgerFile);};
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const sql=(worker,db,q)=>{const container=docker(['ps','-q','--filter','label=com.docker.compose.project='+selection.project,'--filter','label=com.docker.compose.service='+worker+'-db']);assert(container);return docker(['exec','-e','PGOPTIONS=-c default_transaction_read_only=on',container,'psql','-U','postgres','-d',db,'-At','-v','ON_ERROR_STOP=1','-c',q]);};
const dbName=id=>'m_'+digest(id).slice(0,20);
const moduleSql=(id,q)=>sql('worker-3',dbName(id),q);
const tableExists=(id,table)=>moduleSql(id,`SELECT to_regclass('public.${table}') IS NOT NULL`)==='t';
const zeroTable=(id,table,where='true')=>{if(tableExists(id,table))assert.equal(Number(moduleSql(id,`SELECT count(*) FROM ${table} WHERE ${where}`)),0,'Owned work must be empty: '+id+'/'+table);};
const applied=id=>JSON.parse(moduleSql(id,"SELECT coalesce(json_agg(t),'[]') FROM (SELECT version,sha256 FROM module_migrations ORDER BY version)t"));
const noWork=id=>{
 if(id==='cee.inventory'){zeroTable(id,'inventory_items');zeroTable(id,'inventory_reservations');zeroTable(id,'inventory_service_stock');zeroTable(id,'inventory_service_reservations');}
 else if(id==='cee.sales'){zeroTable(id,'business_records');zeroTable(id,'sales_accepted_prices');assert.equal(Number(sql('worker-3','steward',"SELECT count(*) FROM smart_obligations WHERE consumer_id='cee.sales'")),0,'Original Sales obligations must remain untouched');}
 else{zeroTable(id,'business_records',"kind IN ('order','job')");zeroTable(id,'connector_issuance',"state='issued'");}
 zeroTable(id,'integration_outbox',"status='pending'");
 assert.equal(Number(sql('worker-3','steward',`SELECT count(*) FROM smart_obligations o JOIN smart_bindings b USING(binding_id) WHERE o.provider_id='${id}' AND b.peer_installation_id IS NULL`)),0,'Local original provider obligations block upgrade');
};
const catalog=JSON.parse(await fs.readFile(path.join(directory,'modules/public/catalog.json'),'utf8')),trust=JSON.parse(await fs.readFile(path.join(directory,'modules/public/trust.json'),'utf8'));
const entityIds=Object.fromEntries(identity.map(w=>[w.key,sql(w.key,'steward',"SELECT entity_id FROM local_enrollment WHERE singleton AND state='enrolled'")]));
assert(Object.values(entityIds).every(id=>/^[a-f0-9-]{36}$/i.test(id)),'Actual enrolled entities required');
if(state.entityIds)assert.equal(canonical(state.entityIds),canonical(entityIds),'Original entity enrollment changed');else{state.entityIds=entityIds;await persist();}
await logins();
const upgrade=async(id,oldVersion,target,flags,connector=false)=>{
 const manager=(await api('worker-3','/api/v3/modules')).value,candidate=manager.available.find(p=>p.packageId===id+'@'+target),current=manager.installed.find(m=>m.moduleId===id);
 assert(candidate?.trusted&&candidate?.compatible);assert(current);assert(migrationCompatible(current,candidate));
 assert.notEqual(current.state,'failed','Module installation failed: '+(current.errorCode??'UNKNOWN')+'; reconcile explicitly before retry');
 const signed=catalog.packages.find(d=>d.payload.manifest.moduleId===id&&d.payload.manifest.version===target);assert(signed);const payload=verifyPackage(signed,trust);
 let entry=state.upgrades[id];
 if(!entry){assert.equal(current.version,oldVersion,'Unexpected installed version; do not adopt an unrecorded upgrade');assert.equal(current.state,'active');noWork(id);assert.equal(canonical(applied(id)),canonical(current.manifest.persistence.migrations));entry=state.upgrades[id]={operationId:randomUUID(),oldOperationId:current.operationId,oldImageId:current.imageId,originalConfiguration:structuredClone(current.configuration),target,packageDigest:digest(canonical(signed)),imageId:payload.imageId,phase:'planned'};await persist();}
 assert.equal(entry.target,target);assert.equal(entry.packageDigest,digest(canonical(signed)));assert.equal(entry.imageId,payload.imageId);
 assert([oldVersion,target].includes(current.version));
 if(connector){
  assert.equal(entry.originalConfiguration.mode,'live');assert.equal(entry.originalConfiguration.integrationsEnabled,false);if(id==='cee.printify')assert.equal(entry.originalConfiguration.productionEnabled,false);
  const compose=JSON.parse(await fs.readFile('.steward/operator/compose.json','utf8')),mounts=compose.services['worker-3-module-host'].volumes,hostFile=mounts.find(v=>v.target==='/etc/steward/module-host.json').source,host=JSON.parse(await fs.readFile(hostFile,'utf8')),secretRoot=mounts.find(v=>v.target===host.connectorSecretsRoot).source,secretFile=path.join(secretRoot,'m_'+digest(id).slice(0,20)+'.json');
  const privateDigest=digest(await fs.readFile(secretFile));if(!entry.privateDigest){entry.privateDigest=privateDigest;entry.privateFile=secretFile;entry.network=host.connectorEgress[id].network;await persist();}assert.equal(privateDigest,entry.privateDigest);assert.equal(host.connectorEgress[id].network,entry.network);
  if(current.version===oldVersion&&host.connectorEgress[id].imageId!==payload.imageId){assert.equal(host.connectorEgress[id].imageId,entry.oldImageId);execFileSync(process.execPath,['scripts/configure-connector-egress.mjs','--directory',directory,'--worker','worker-3','--module',id,'--upgrade-package',id+'@'+target,'--expected-image',payload.imageId],{cwd:root,stdio:['ignore','pipe','pipe']});entry.phase='egress-approved';await persist();}
  assert.equal(JSON.parse(await fs.readFile(hostFile,'utf8')).connectorEgress[id].imageId,payload.imageId);
 }
 if(current.version!==target||current.state==='installing'){
  noWork(id);if(current.version===oldVersion){assert.equal(current.operationId,entry.oldOperationId);assert.equal(canonical(current.configuration),canonical(entry.originalConfiguration));}
  else assert.equal(current.operationId,entry.operationId,'New package operation identity changed');
  if(current.state!=='installing')await api('worker-3','/api/v3/modules/install','POST',{packageId:id+'@'+target,operationId:entry.operationId,configuration:entry.originalConfiguration,upgrade:true});
  const ready=await waitFor(async()=>{const x=await installed('worker-3',id);return x.version===target&&x.state!=='installing'?x:null;},id+' upgrade',180000);assert.notEqual(ready.state,'failed','Module installation failed: '+(ready.errorCode??'UNKNOWN'));assert(['installed','active'].includes(ready.state));entry.phase='upgraded-original-configuration';await persist();
 }
 const ready=await activatePreparedModule({expected:{version:target,operationId:entry.operationId,imageId:payload.imageId},read:()=>installed('worker-3',id),activate:()=>api('worker-3','/api/v3/modules/'+id+'/lifecycle','POST',{action:'activate'}),persistStage:async phase=>{entry.phase=phase;await persist();},wait:()=>waitFor(async()=>{const row=await installed('worker-3',id);return row.state==='active'||row.state==='failed'?row:null;},id+' explicit activation')});
 if(!entry.desiredConfiguration){for(const [key,value]of Object.entries(entry.originalConfiguration))assert.equal(canonical(ready.configuration[key]),canonical(value),'Original configuration changed before explicit new-capability review');entry.beforeConfiguration=structuredClone(ready.configuration);entry.desiredConfiguration={...ready.configuration,...flags};entry.phase='config-reviewed';await persist();}
 assert(entry.desiredConfiguration);const configurationMatches=canonical(ready.configuration)===canonical(entry.desiredConfiguration);
 if(entry.phase==='configured')assert(configurationMatches,'Completed configuration changed later; do not reset operator changes');
 else if(!configurationMatches){assert.equal(canonical(ready.configuration),canonical(entry.beforeConfiguration),'Configuration changed since review');await api('worker-3','/api/v3/modules/'+id+'/configuration','PUT',{configuration:entry.desiredConfiguration});}
 if(connector)assert.equal(digest(await fs.readFile(entry.privateFile)),entry.privateDigest,'Private connection profiles changed during upgrade');
 assert.equal(canonical(applied(id)),canonical(payload.manifest.persistence.migrations));entry.phase='configured';await persist();console.log('Prepared exact reviewed '+id+'@'+target+' on worker-3.');
};
if(values.mode==='upgrade-local'){
 await upgrade('cee.inventory','1.2.1','1.6.0',{integrationsEnabled:true,quantityUnit:'units',referenceLeaseSeconds:1800});
 await upgrade('cee.sales','1.2.3','1.5.0',{integrationsEnabled:true,smartInventory:true,governedSalesEnabled:true,governedCatalogEnabled:true,catalogMaxAgeSeconds:1800,analyticalCatalogMaxAgeSeconds:1800,confirmationIntentSeconds:300});
}else if(values.mode==='upgrade-connectors'){
 await upgrade('cee.shopify','1.2.0','1.3.0',{catalogReadEnabled:true,catalogObservationMaxAgeSeconds:3600},true);
 await upgrade('cee.printify','1.1.2','1.3.0',{catalogReadEnabled:true,catalogObservationMaxAgeSeconds:3600},true);
}else if(values.mode==='reviewers'){
 const file=path.join(directory,'demo/phase15-i-browser.json'),reviewState=JSON.parse(await fs.readFile(file,'utf8')),moduleId='steward.pricing.management';
 for(const worker of ['worker-1','worker-2','worker-3']){const recorded=reviewState.workers?.[worker]?.reviewer;assert(recorded,'Existing reviewed actor state required; no account creation/reset');await fs.access(path.join(directory,recorded.passwordFile));const account=(await api(worker,'/api/v3/modules/accounts')).value.accounts.find(a=>a.account_id===recorded.accountId);assert.equal(account?.username,recorded.username);assert.equal(account?.role,'module_user');const grants=JSON.parse(sql(worker,'steward',`SELECT coalesce(json_agg(permission ORDER BY permission),'[]') FROM module_permissions WHERE account_id='${recorded.accountId}' AND module_id='${moduleId}'`));assert.equal(canonical(grants),canonical([moduleId+'.read',moduleId+'.review']),'Reconcile changed reviewer grants explicitly; no automatic renewal');console.log('Verified existing distinct minimal reviewer on '+worker+'.');}
}else await governance();

async function governance(){
 const C='steward.catalog.universal',P='steward.pricing.management',S='cee.sales';
 const routes=[];for(const worker of ['worker-1','worker-2','worker-3'])routes.push([worker,P,C,'catalog.offerings.read',['catalog.lookup','catalog.read','catalog.discover','catalog.import-preview']],[worker,P,C,'catalog.pricing-subjects.read',['catalog.pricing.lookup']]);
 routes.push(['worker-3',C,'cee.inventory','inventory.items.read',['inventory.items.discover','inventory.items.lookup']],['worker-3',C,'cee.procurement','procurement.suppliers.read',['procurement.suppliers.discover','procurement.suppliers.lookup']],['worker-3',P,'cee.procurement','costs.procurement.read',['cost-evidence.discover','cost-evidence.lookup']],['worker-3',S,C,'catalog.offerings.read',['catalog.lookup','catalog.read','catalog.discover','catalog.import-preview']],['worker-3',S,C,'catalog.operational.read',['catalog.operational.lookup']],['worker-3',S,C,'catalog.publications.read',['catalog.publication.lookup']],['worker-3',S,P,'pricing.prices.resolve',['pricing.request','pricing.status']],['worker-3',S,'cee.inventory','inventory.stock.verified',['stock.verified.reserve','stock.verified.release','stock.verified.consume']]);
 if(values['include-connectors'])for(const family of ['shopify','printify'])routes.push(['worker-3',C,'cee.'+family,'catalog.'+family+'.read',['external-catalog.connections','external-catalog.discover','external-catalog.lookup']]);
 const managers={};for(const worker of ['worker-1','worker-2','worker-3'])managers[worker]=(await api(worker,'/api/v3/modules')).value;
 if(!state.governance){const plan={includeConnectors:values['include-connectors'],bindings:[],workflows:[]},groups=new Map();
  noWork(S);
  for(const [worker,consumerId,providerId,capabilityId,operations]of routes){const consumer=managers[worker].installed.find(m=>m.moduleId===consumerId),provider=managers[worker].installed.find(m=>m.moduleId===providerId);assert.equal(consumer?.state,'active');assert.equal(provider?.state,'active');const descriptor=catalog.packages.find(d=>d.payload.manifest.moduleId===providerId&&d.payload.manifest.version===provider.version);assert(descriptor);const p=verifyPackage(descriptor,trust);assert.equal(p.imageId,provider.imageId);const capability=p.manifest.smart.provides.find(c=>c.capabilityId===capabilityId),requirement=consumer.manifest.smart.consumes.find(c=>c.capabilityId===capabilityId);assert(capability&&requirement);for(const op of operations)assert(capability.operations.some(o=>o.name===op)&&requirement.operations.some(o=>o.name===op));
   const existing=Number(sql(worker,'steward',`SELECT count(*) FROM smart_bindings WHERE consumer_id='${consumerId}' AND capability_id='${capabilityId}' AND state='approved'`));assert.equal(existing,0,'Existing approval requires separate review; no silent rebinding');
   const bindingId=randomUUID(),reason='Phase 15 reviewed local synthetic demonstration; original obligations remain on their original provider and package';plan.bindings.push({worker,consumerId,providerId,consumerOperationId:consumer.operationId,providerOperationId:provider.operationId,packageDigest:digest(canonical(descriptor)),bindingId,capabilityId,reason,operations});const key=worker+'/'+consumerId;if(!groups.has(key))groups.set(key,{worker,consumerId,workflowId:randomUUID(),name:'Phase15 '+worker+' '+consumerId,version:1,steps:[],reason});groups.get(key).steps.push(...operations.map(operation=>({bindingId,operation})));}
  for(const group of groups.values()){assert(group.steps.length<=16);const active=Number(sql(group.worker,'steward',`SELECT count(*) FROM smart_workflows WHERE consumer_id='${group.consumerId}' AND state='active' AND accepting_new`));assert.equal(active,0,'Existing new-work workflow requires separate reviewed replacement');plan.workflows.push(group);}state.governance=plan;await persist();
 }
 const plan=state.governance;assert.equal(plan.includeConnectors,values['include-connectors'],'Frozen plan cannot silently add or renew routes');
 for(const b of plan.bindings){const provider=managers[b.worker].installed.find(m=>m.moduleId===b.providerId),consumer=managers[b.worker].installed.find(m=>m.moduleId===b.consumerId);assert.equal(provider.operationId,b.providerOperationId);assert.equal(consumer.operationId,b.consumerOperationId);const descriptor=catalog.packages.find(d=>d.payload.manifest.moduleId===provider.moduleId&&d.payload.manifest.version===provider.version);assert.equal(digest(canonical(descriptor)),b.packageDigest);await api(b.worker,'/api/v8/smart-modules/bindings','POST',{bindingId:b.bindingId,consumerId:b.consumerId,capabilityId:b.capabilityId,providerId:b.providerId,packageDigest:b.packageDigest,reason:b.reason,preserveExistingObligations:true});}
 for(const w of plan.workflows){const {worker,...body}=w;await api(worker,'/api/v8/smart-modules/workflows','POST',body);let actual=(await api(worker,'/api/v8/smart-modules')).value.workflows.find(x=>x.workflow_id===w.workflowId);assert(actual);if(actual.state==='proposed'){await api(worker,'/api/v8/smart-modules/workflows/'+w.workflowId+'/lifecycle','POST',{action:'approve',reason:w.reason});actual={state:'approved'};}if(actual.state==='approved')await api(worker,'/api/v8/smart-modules/workflows/'+w.workflowId+'/lifecycle','POST',{action:'activate',reason:w.reason});else assert.equal(actual.state,'active','Do not re-enable disabled or suspended workflow');}
 console.log('Prepared reviewed local SSMA bindings/workflows with original pins and stable private IDs.');
}
}finally{await fs.rmdir(lock);}
