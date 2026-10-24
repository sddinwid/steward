import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {directory,manifest,compose,sql} from './lib.mjs';
import {digest} from '../packages/module-sdk/dist/index.js';
const deployment=await manifest();
async function snapshot(){
 const files={};for(const entry of await readdir(directory,{recursive:true,withFileTypes:true}))if(entry.isFile()){
  const file=path.join(entry.parentPath,entry.name),relative=path.relative(directory,file).replaceAll('\\','/');
  // Release selection and the append-only catalog are deliberately changed by an upgrade.
  if(!relative.startsWith('release/')&&relative!=='modules/public/catalog.json')files[relative]=digest(await readFile(file));
 }
 const workers={};for(const worker of deployment.instances.filter(i=>i.role==='worker')){
  const modules=JSON.parse(sql(worker.key,"SELECT COALESCE(json_agg(x ORDER BY module_id),'[]') FROM (SELECT module_id,version,state,configuration,operation_id,descriptor FROM module_installations) x"));
  const tables={};for(const module of modules){
   const database='m_'+digest(module.module_id).slice(0,20);
   const query=q=>compose('exec','-T',worker.key+'-db','psql','-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1','-c',q);
   const names=query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('business_records','inventory_items','inventory_reservations','inventory_movements','replenishment_requirements','capacities','storage_requirements','warehouse_assets') ORDER BY tablename").split('\n').filter(Boolean);
   tables[module.module_id]=Object.fromEntries(names.map(table=>[table,query(`SELECT count(*)||':'||md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'')) FROM ${table} r`)]));
  }
  workers[worker.key]={enrollmentHash:digest(sql(worker.key,'SELECT row_to_json(e) FROM local_enrollment e')),modulesHash:digest(JSON.stringify(modules)),tables};
 }
 const core={};for(const instance of deployment.instances){
  const tables=['platform_installation','security_accounts','legal_entities','entity_authorizations',...(instance.role==='master'?['entity_relationships','analytical_records','analytical_findings','finding_entities','finding_deliveries','finding_receipts','analyst_investigations','analyst_activity']:[])];
  core[instance.key]=Object.fromEntries(tables.map(table=>[table,sql(instance.key,`SELECT count(*)||':'||md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'')) FROM ${table} r`)]));
 }
 return{files,workers,core};
}
const file='artifacts/bi-preservation-baseline.json';
if(process.argv.includes('--capture')){await writeFile(file,JSON.stringify(await snapshot(),null,2));console.log('Captured private-file and database hashes');}
else{const before=JSON.parse(await readFile(file)),after=await snapshot();assert.deepEqual(after,before);await writeFile('artifacts/bi-preservation.json',JSON.stringify({status:'passed',configurationFiles:Object.keys(after.files).length,workerCount:Object.keys(after.workers).length,checkedAt:new Date().toISOString(),checks:['All private file bytes','Account/password hashes','Installation and enrollment identities','Module installations and configuration','All retained business/module records','Master evidence, investigations, findings and relationships']}));console.log('PASS every retained record and private file hash is unchanged');}
