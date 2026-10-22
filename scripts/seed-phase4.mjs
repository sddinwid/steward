import { atLeast } from '../packages/module-sdk/dist/index.js';
import { readFile,writeFile,mkdir,rename,rmdir } from 'node:fs/promises';
import path from 'node:path';
import { directory } from './lib.mjs';
import { randomUUID } from 'node:crypto';
import { api,logins,sessions,waitFor,deployment } from './phase4-client.mjs';
const scenario=JSON.parse(await readFile('datasets/phase4.json','utf8'));
const stateFile=path.join(directory,'data/scenario-state.json');
const identities=deployment.instances.map(i=>({key:i.key,installationId:i.installationId}));
let seedState={version:1,installations:identities,records:{}};
try{seedState=JSON.parse(await readFile(stateFile,'utf8'));if(seedState.version!==1||!seedState.records||JSON.stringify(seedState.installations)!==JSON.stringify(identities))throw new Error('Synthetic seed state belongs to another installation');}catch(e){if(e.code!=='ENOENT')throw e;}
const lock=path.join(directory,'data/.seed-lock');await mkdir(lock);
try{
await logins();const entities={};
for(const company of scenario.companies){
 const key=company.worker;let state=(await api(key,'/api/v2/worker/status')).value;
 const entityId=state.enrollmentState==='enrolled'?state.entityId:company.entityId;
 if(!entityId)throw new Error('Manufacturer must already be enrolled; run Phase 2 verification or enroll it through the trusted wizard first');
 entities[key]=entityId;
 const all=(await api('master','/api/v2/entities')).value.entities;const existing=all.find(e=>e.entityId===entityId);
 await api('master','/api/v2/entities','PUT',{entityId,name:existing?.name??company.name,classification:company.role,enrollmentEligible:true});
 await api('master','/api/v2/authorizations','PUT',{accountId:sessions.master.account.account_id,entityId,allowed:true});
 if(state.enrollmentState!=='enrolled'){
  await api(key,'/api/v2/worker/connection','PUT',{profileId:'master'});
  if(state.enrollmentState!=='pending')await api(key,'/api/v2/worker/start','POST',{requestId:randomUUID()});
  state=await waitFor(async()=>{const s=(await api(key,'/api/v2/worker/status')).value;return s.userCode?s:false;},'enrollment authorization code');
  await api('master','/api/v2/enrollment/authorize','POST',{code:state.userCode,entityId});
  await api('master','/api/v2/enrollment/decision','POST',{requestId:state.requestId,entityId,decision:'approve'});
  await waitFor(async()=>(await api(key,'/api/v2/worker/status')).value.enrollmentState==='enrolled','persisted Worker enrollment');
 }
 // Installation is real and enrollment-bound, through the same local manager APIs.
 const m=(await api(key,'/api/v3/modules')).value;
 const existingModule=m.installed.find(m=>m.moduleId==='cee.operations');
 if(!existingModule||['failed','installing'].includes(existingModule.state))await api(key,'/api/v3/modules/install','POST',{packageId:'cee.operations@1.0.0',operationId:randomUUID(),configuration:{currency:'EUR'},recover:!!existingModule});
 await api(key,'/api/v3/modules/cee.operations/lifecycle','POST',{action:'activate'});
 for(const record of company.records){const url='/api/v3/modules/cee.operations/api/'+record.path;const {path,seedKey,...body}=record;const recordKey=key+'/'+seedKey;const rows=(await api(key,url)).value.records;const old=rows.find(r=>r.id===seedState.records[recordKey])??rows.find(r=>r.name===body.name);seedState.records[recordKey]=old?.id??(await api(key,url,'POST',body,201)).value.record.id;}
 console.log('Seeded synthetic '+company.role+' records on '+key+' using its authorized legal entity.');
}
const manufacturer='worker-1';let inventory=(await api(manufacturer,'/api/v3/modules')).value.installed.find(m=>m.moduleId==='cee.inventory');
if(!inventory||!atLeast(inventory.version,'1.1.0')){const manager=(await api(manufacturer,'/api/v3/modules')).value;const candidate=manager.available.filter(p=>p.trusted&&p.compatible&&p.manifest.moduleId==='cee.inventory'&&atLeast(p.manifest.version,'1.1.0')).sort((a,b)=>atLeast(a.manifest.version,b.manifest.version)?-1:1)[0];if(!candidate)throw new Error('Publish a compatible Inventory package >=1.1.0 before seeding');await api(manufacturer,'/api/v3/modules/install','POST',{packageId:candidate.packageId,operationId:randomUUID(),configuration:inventory?.configuration??{quantityUnit:'units'},upgrade:!!inventory});}
await api(manufacturer,'/api/v3/modules/cee.inventory/lifecycle','POST',{action:'activate'});
const items='/api/v3/modules/cee.inventory/api/items';const stockRows=(await api(manufacturer,items)).value.records;const oldStock=stockRows.find(r=>r.id===seedState.records.inventory)??stockRows.find(r=>r.sku===scenario.inventory.sku);seedState.records.inventory=oldStock?.id??(await api(manufacturer,items,'POST',scenario.inventory,201)).value.record.id;
for(const relation of scenario.relationships){const existing=(await api('master','/api/v4/analytics')).value.relationships.find(r=>r.from_entity===entities[relation.from]&&r.to_entity===entities[relation.to]&&r.kind===relation.kind);if(!existing)await api('master','/api/v4/relationships','PUT',{relationshipId:randomUUID(),fromEntity:entities[relation.from],toEntity:entities[relation.to],kind:relation.kind,description:relation.description});}
await waitFor(async()=>{const d=(await api('master','/api/v4/analytics')).value;return scenario.companies.every(c=>d.records.some(r=>r.entity_id===entities[c.worker]&&r.module_id==='cee.operations'))&&d.records.some(r=>r.entity_id===entities[manufacturer]&&r.module_id==='cee.inventory');},'analytical catch-up');
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/phase4-seed.json',JSON.stringify({seededAt:new Date().toISOString(),entities,installations:deployment.instances.map(i=>({key:i.key,installationId:i.installationId})),scenario:'datasets/phase4.json'},null,2));
const temporary=stateFile+'.tmp-'+randomUUID();await writeFile(temporary,JSON.stringify(seedState,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temporary,stateFile);
console.log('PASS synthetic scenario seeded through authenticated enrollment/module/record APIs and synchronized; repeated seeding preserves existing records.');
}finally{await rmdir(lock);}
