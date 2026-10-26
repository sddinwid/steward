// Upgrade the selected operator in place from committed, digest-pinned images.
// Backups and private state never enter Git. Existing module packages are not
// upgraded or reinstalled by this core operation.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {privateDirectory} from '../tools/installer/dist/security.js';
import {selectDeployment} from './select-deployment.mjs';
const selected=JSON.parse(await readFile('.steward/operator/selection.json','utf8')),directory=path.resolve(selected.directory);
assert.equal(path.resolve(process.argv[2]??''),directory,'Explicitly name the selected deployment');
const run=(name,args)=>execFileSync(name,args,{encoding:'utf8',maxBuffer:256*1024*1024}).trim(),docker=args=>run('docker',args),hash=s=>createHash('sha256').update(s).digest('hex');
const built=JSON.parse(await readFile(process.argv[3]??'artifacts/core-images-0.13.0.json','utf8')),sourceCommit=built.sourceCommit;
assert.equal(built.version,'0.13.0');run('git',['merge-base','--is-ancestor',sourceCommit,'HEAD']);
const sourceDatabase=run('git',['show',sourceCommit+':packages/platform/src/database.ts']),expectedSchema=Math.max(...[...sourceDatabase.matchAll(/version:\s*(\d+),\s*sql:/g)].map(m=>Number(m[1])));
assert(expectedSchema>=16);
for(const kind of ['master-api','worker-api','master-web','worker-web','module-host']){
 const id=built.images[kind];assert(/^sha256:[a-f0-9]{64}$/.test(id));const image=JSON.parse(docker(['image','inspect',id]))[0];
 assert.equal(image.Config.Labels['org.opencontainers.image.revision'],sourceCommit);assert.equal(image.Config.Labels['org.opencontainers.image.version'],'0.13.0');
}
const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));assert.equal(manifest.project,selected.project);
const query=(key,db,sql)=>docker(['exec',docker(['ps','-q','--filter','label=com.docker.compose.project='+manifest.project,'--filter','label=com.docker.compose.service='+key+'-db']),'psql','-U','postgres','-d',db,'-At','-v','ON_ERROR_STOP=1','-c',sql]);
async function privateHashes(relative=''){const result={};for(const f of await readdir(path.join(directory,relative),{withFileTypes:true})){const name=path.join(relative,f.name);if(name==='release')continue;if(f.isDirectory())Object.assign(result,await privateHashes(name));else result[name]=hash(await readFile(path.join(directory,name)));}return result;}
async function snapshot(){const result={};for(const i of manifest.instances){result[i.key]={};
 for(const table of ['platform_installation','security_accounts','entity_authorizations','enrolled_workers','local_enrollment','smart_bindings','smart_workflows','smart_obligations']){
  const additive=table==='smart_bindings'?['peer_installation_id','peer_grant_id','source_program_id','destination_program_id','purpose','expires_at','local_provider_id']:table==='smart_workflows'?['scope_program_id']:[];
  const expression=additive.length?"to_jsonb(t)-ARRAY["+additive.map(s=>"'"+s+"'").join(',')+"]":"to_jsonb(t)";
  result[i.key][table]=hash(query(i.key,'steward',`SELECT coalesce(jsonb_agg(${expression} ORDER BY (${expression})::text),'[]') FROM ${table} t`));
 }
 if(i.role==='master')for(const table of ['scientific_datasets','scientific_runs','scientific_finding_evidence','analyst_investigations','analyst_activity'])result[i.key][table]=hash(query(i.key,'steward',`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM ${table} t`));
 result[i.key].modules=hash(query(i.key,'steward',"SELECT coalesce(jsonb_agg(jsonb_build_object('id',module_id,'version',version,'descriptor',descriptor,'configuration',configuration,'state',state,'operationId',operation_id) ORDER BY module_id),'[]') FROM module_installations"));
 for(const db of query(i.key,'steward',"SELECT datname FROM pg_database WHERE datname ~ '^m_[a-f0-9]{20}$' ORDER BY datname").split('\n').filter(Boolean)){
  for(const table of query(i.key,db,"SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename='business_records' OR tablename LIKE 'inventory_%' OR tablename IN ('capacities','storage_requirements','warehouse_assets')) ORDER BY tablename").split('\n').filter(Boolean)){
   assert(/^[a-z_]+$/.test(table));const predicate=table==='business_records'?" WHERE kind NOT IN ('connector','commerce-condition') AND NOT(data ? 'simulation')":'';
   result[i.key][db+'/'+table]=hash(query(i.key,db,`SELECT coalesce(jsonb_agg(to_jsonb(t)-'revision'-'updated_at' ORDER BY to_jsonb(t)->>'id'),'[]') FROM ${table} t${predicate}`));
  }
 }
 }return result;}
const backup=path.resolve('.steward/backups/phase13-upgrade',new Date().toISOString().replaceAll(':','-'));await mkdir(backup,{recursive:true});privateDirectory(backup);await cp(directory,path.join(backup,'configuration'),{recursive:true});
for(const i of manifest.instances){const id=docker(['ps','-q','--filter','label=com.docker.compose.project='+manifest.project,'--filter','label=com.docker.compose.service='+i.key+'-db']);await writeFile(path.join(backup,i.key+'-databases.sql'),execFileSync('docker',['exec',id,'pg_dumpall','-U','postgres'],{maxBuffer:256*1024*1024}),{mode:0o600});}
const before=await snapshot(),configuration=await privateHashes(),overlay=path.join(directory,'release/compose.yaml'),old=await readFile(overlay,'utf8');let service='';const images={};
for(const i of manifest.instances){images[i.key+'-api']=built.images[i.role+'-api'];images[i.key+'-web']=built.images[i.role+'-web'];if(i.role==='worker')images[i.key+'-module-host']=built.images['module-host'];}
const updated=old.split('\n').map(line=>{const m=/^  ([a-z0-9-]+):$/.exec(line);if(m)service=m[1];return /^    image:/.test(line)&&images[service]?'    image: '+images[service]:line;}).join('\n');
await writeFile(overlay,updated);await selectDeployment(directory);
execFileSync('docker',['compose','up','-d','--wait','--wait-timeout','180'],{stdio:'inherit'});
assert.deepEqual(await snapshot(),before,'Preserve protected records, accounts, identities and module governance');assert.deepEqual(await privateHashes(),configuration,'Preserve all private operator configuration');
for(const i of manifest.instances){assert.equal(query(i.key,'steward','SELECT max(version) FROM platform_migrations'),String(expectedSchema));assert.equal((await fetch('http://127.0.0.1:'+i.apiPort+'/ready')).status,200);assert.equal((await fetch('http://127.0.0.1:'+i.webPort)).status,200);}
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/phase13-selected-upgrade.json',JSON.stringify({status:'passed',sourceCommit,expectedSchema,project:manifest.project,images,protectedSnapshot:hash(JSON.stringify(before)),privateConfigurationPreserved:true,backup,verifiedAt:new Date().toISOString()},null,2)+'\n');
console.log('PASS selected Phase 13 candidate core upgrade; original module packages, identities, configuration and protected data preserved.');
