// Operator acceptance: never deletes volumes, records, credentials or configuration.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {directory,manifest,compose,sql,json} from './lib.mjs';
import {digest} from '../packages/module-sdk/dist/index.js';
const bundle=path.resolve(process.argv[3]??'artifacts/releases/steward-0.7.0'),deployment=await manifest();
const release=JSON.parse(await readFile(path.join(bundle,'release.json'),'utf8'));
const report={startedAt:new Date().toISOString(),project:deployment.project,release:release.version,releaseSourceCommit:release.sourceCommit};
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
 return{files,workers};
}
const run=(action)=>execFileSync(process.execPath,['scripts/release.mjs',action,'--bundle',bundle,'--directory',directory,'--trust-bundled-modules'],{stdio:'inherit',timeout:900000});
try{
 report.before=await snapshot();run('upgrade');run('start');
 if(process.argv.includes('--restart')){run('stop');run('start');}
 report.after=await snapshot();assert.deepEqual(report.after,report.before,'Upgrade/redeployment changed retained configuration, identity or business data');
 report.images={};for(const instance of deployment.instances){
  for(const kind of ['api','web',...(instance.role==='worker'?['module-host']:[])]){
   const service=instance.key+'-'+kind,actual=JSON.parse(execFileSync('docker',['inspect',compose('ps','-q',service)],{encoding:'utf8'}))[0].Image;
   const expected=release.images[kind==='module-host'?kind:instance.role+'-'+kind].id;assert.equal(actual,expected);report.images[service]=actual;
  }
  assert.equal((await json('http://127.0.0.1:'+instance.apiPort+'/health')).status,'ok');await json('http://127.0.0.1:'+instance.apiPort+'/ready');
 }
 report.status='passed';report.preservedFiles=Object.keys(report.before.files).length;console.log('PASS release redeployment preserves file bytes, module state, enrollment and business-record hashes; every running core image matches the release');
}catch(error){report.status='failed';report.failure=error.message;throw error;}
finally{report.finishedAt=new Date().toISOString();await writeFile('artifacts/phase7-redeployment-'+deployment.project+'.json',JSON.stringify(report,null,2)+'\n');}
