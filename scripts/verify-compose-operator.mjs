// Actual direct-Compose acceptance on a selected, quiescent deployment.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {directory,manifest,compose,sql,json} from './lib.mjs';
import {digest} from '../packages/module-sdk/dist/index.js';
const deployment=await manifest();await mkdir('artifacts',{recursive:true});
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
const run=(...args)=>execFileSync('docker',['compose',...args],{encoding:'utf8',timeout:300000,stdio:['ignore','pipe','pipe']});
const associated=()=>{const ids=deployment.instances.map(i=>i.installationId);return execFileSync('docker',['ps','--format','{{json .}}'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)).filter(r=>r.Names.startsWith(deployment.project+'-')||ids.some(id=>r.Labels?.includes('steward.installation='+id)));};
const report={project:deployment.project,startedAt:new Date().toISOString(),checks:[]};
try{const cfg=JSON.parse(run('config','--format','json'));assert.equal(cfg.name,deployment.project);assert(Object.keys(cfg.services).every(k=>!cfg.services[k].build),'Release startup must not rebuild mutable image tags');
 report.before=await snapshot();report.runningBefore=associated().length;assert(report.runningBefore>deployment.instances.length*3,'Installed modules must actually be running');
 report.downOutput=run('down');assert.equal(associated().length,0,'Compose down left installation containers running');report.checks.push('direct docker compose down stops all core and dynamically installed module containers');
 const volumes=Object.values(cfg.volumes??{}).map(v=>v.name);for(const name of volumes)execFileSync('docker',['volume','inspect',name],{stdio:'ignore'});report.checks.push('all named database and module-state volumes retained after down');
 run('up','-d','--build','--wait','--wait-timeout','180');report.after=await snapshot();assert.deepEqual(report.after,report.before);report.checks.push('up -d --build --wait preserves every private file, password/account hash, identity, enrollment, module state and protected business table');
 report.runningAfter=associated().length;assert.equal(report.runningAfter,report.runningBefore);for(const i of deployment.instances){assert.equal((await json('http://127.0.0.1:'+i.apiPort+'/health')).status,'ok');assert.equal((await json('http://127.0.0.1:'+i.apiPort+'/ready')).status,'ready');}report.checks.push('all Master/Worker health and readiness endpoints pass; dynamic modules restore');
 run('ps');run('logs','--tail','2');report.checks.push('standard docker compose ps and logs work');report.status='passed';console.log('PASS direct Docker Compose lifecycle, volume/data/identity preservation and dynamic module recovery');
}catch(e){report.status='failed';report.failure=e.message;throw e;}finally{report.finishedAt=new Date().toISOString();await writeFile('artifacts/compose-operator-verification.json',JSON.stringify(report,null,2)+'\n');}
