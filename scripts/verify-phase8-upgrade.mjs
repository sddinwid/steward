// Upgrade a separately provisioned, populated v0.7 installation. Never reset data.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {directory,manifest,compose,sql,json,docker} from './lib.mjs';
import {digest} from '../packages/module-sdk/dist/index.js';
const redeploy=process.argv.includes('--redeploy'),bundle=path.resolve(process.argv[3]),deployment=await manifest(),report={startedAt:new Date().toISOString(),project:deployment.project};
async function snapshot(){
 const files={};for(const e of await readdir(directory,{recursive:true,withFileTypes:true}))if(e.isFile()){const file=path.join(e.parentPath,e.name),name=path.relative(directory,file).replaceAll('\\','/');if(!name.startsWith('release/')&&name!=='modules/public/catalog.json')files[name]=digest(await readFile(file));}
 const core={},modules={};for(const i of deployment.instances){
  core[i.key]={};for(const table of ['platform_installation','security_accounts','legal_entities','entity_authorizations','local_enrollment','enrolled_workers','module_installations',...(i.role==='master'?['analytical_records','analytical_findings','finding_receipts','analyst_investigations']:[])])core[i.key][table]=sql(i.key,`SELECT count(*)||':'||md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM ${table} t`);
  if(i.role!=='worker')continue;modules[i.key]={};for(const id of sql(i.key,'SELECT module_id FROM module_installations ORDER BY module_id').split('\n').filter(Boolean)){
   const database='m_'+digest(id).slice(0,20),query=q=>compose('exec','-T',i.key+'-db','psql','-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1','-c',q);
   const tables=query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('inventory_items','inventory_reservations','inventory_movements','business_records','capacities','storage_requirements','warehouse_assets','business_actions','integration_inbox') ORDER BY tablename").split('\n').filter(Boolean);modules[i.key][id]=Object.fromEntries(tables.map(table=>[table,query(`SELECT count(*)||':'||md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM ${table} t`)]));
  }
 }return{files,core,modules};
}
try{
 for(const i of deployment.instances)assert.equal((await json('http://127.0.0.1:'+i.apiPort+'/api/v1/platform')).release,redeploy?'0.8.0':'0.7.0','Must begin with the actual selected starting runtime');
 const simulators=JSON.parse(await readFile(path.join(directory,'commerce/manifest.json'),'utf8').catch(()=>'{"simulators":false}')).simulators;report.before=await snapshot();const run=action=>execFileSync(process.execPath,['scripts/release.mjs',action,'--bundle',bundle,'--directory',directory,'--trust-bundled-modules',...(simulators?['--simulators']:[])],{stdio:'inherit',timeout:900000});run('upgrade');run('start');report.after=await snapshot();
 for(const [name,hash]of Object.entries(report.before.files))assert.equal(report.after.files[name],hash,'Retained file changed: '+name);assert.deepEqual(report.after.core,report.before.core);assert.deepEqual(report.after.modules,report.before.modules);
 const release=JSON.parse(await readFile(path.join(bundle,'release.json'),'utf8'));report.images={};for(const i of deployment.instances){assert.equal((await json('http://127.0.0.1:'+i.apiPort+'/api/v1/platform')).release,'0.8.0');assert.equal(sql(i.key,'SELECT max(version) FROM platform_migrations'),'9');for(const kind of ['api','web',...(i.role==='worker'?['module-host']:[])]){const actual=JSON.parse(docker(['inspect',compose('ps','-q',i.key+'-'+kind)]))[0].Image;assert.equal(actual,release.images[kind==='module-host'?kind:i.role+'-'+kind].id);report.images[i.key+'-'+kind]=actual;}}
 report.status='passed';console.log('PASS actual v0.7 to v0.8 upgrade: retained file bytes, databases, accounts, enrollment, module state/business history and pinned image IDs');
}catch(e){report.status='failed';report.error=e.message;throw e;}finally{report.finishedAt=new Date().toISOString();await writeFile(redeploy?'artifacts/phase8-redeployment.json':'artifacts/phase8-upgrade.json',JSON.stringify(report,null,2)+'\n');}
