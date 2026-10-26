// In-place schema/core upgrade. Module installation remains an independent operation.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {privateDirectory} from '../tools/installer/dist/security.js';
import {selectDeployment} from './select-deployment.mjs';
const selected=JSON.parse(await readFile('.steward/operator/selection.json','utf8')),directory=path.resolve(selected.directory);
assert.equal(path.resolve(process.argv[2]??''),directory,'Explicitly name the selected existing deployment');
const run=(name,args)=>execFileSync(name,args,{encoding:'utf8',maxBuffer:256*1024*1024}).trim(),docker=args=>run('docker',args),hash=s=>createHash('sha256').update(s).digest('hex');
assert.equal(run('git',['status','--porcelain']),'','Commit the verified implementation before upgrading');
const sourceCommit=run('git',['rev-parse','HEAD']),built=JSON.parse(await readFile('artifacts/core-images-0.12.0.json','utf8'));assert.equal(built.sourceCommit,sourceCommit);
for(const [kind,imageId]of Object.entries(built.images)){const image=JSON.parse(docker(['image','inspect',imageId]))[0];assert.equal(image.Config.Labels['org.opencontainers.image.revision'],sourceCommit);assert.equal(image.Config.Labels['org.opencontainers.image.version'],kind==='scientific'?'1.0.0':'0.12.0');assert.equal(JSON.parse(docker(['image','inspect',kind==='scientific'?'steward-scientific:1.0.0':'steward-'+kind+':0.12.0']))[0].Id,imageId);}
const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));assert.equal(manifest.project,selected.project);
const query=(key,db,sql)=>docker(['exec',docker(['ps','-q','--filter','label=com.docker.compose.project='+manifest.project,'--filter','label=com.docker.compose.service='+key+'-db']),'psql','-U','postgres','-d',db,'-At','-v','ON_ERROR_STOP=1','-c',sql]);
async function privateHashes(relative=''){const result={};for(const f of await readdir(path.join(directory,relative),{withFileTypes:true})){const name=path.join(relative,f.name);if(name==='release')continue;if(f.isDirectory())Object.assign(result,await privateHashes(name));else result[name]=hash(await readFile(path.join(directory,name)));}return result;}
async function snapshot(){const result={};for(const i of manifest.instances){result[i.key]={};for(const table of ['platform_installation','security_accounts','entity_authorizations','enrolled_workers','local_enrollment','smart_bindings','smart_workflows','smart_obligations'])result[i.key][table]=hash(query(i.key,'steward',`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM ${table} t`));
 if(i.role==='master')for(const table of ['scientific_datasets','scientific_runs','scientific_finding_evidence','analyst_investigations','analyst_activity'])result[i.key][table]=hash(query(i.key,'steward',`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM ${table} t`));
 result[i.key].modules=hash(query(i.key,'steward',"SELECT coalesce(jsonb_agg(jsonb_build_object('id',module_id,'version',version,'descriptor',descriptor,'configuration',configuration,'state',state,'operationId',operation_id) ORDER BY module_id),'[]') FROM module_installations"));
 // Live connector status timestamps can change during read-only catalog polls.
 // Retained operational identities/content are compared separately from those observations.
 for(const db of query(i.key,'steward',"SELECT datname FROM pg_database WHERE datname ~ '^m_[a-f0-9]{20}$' ORDER BY datname").split('\n').filter(Boolean)){
  for(const table of query(i.key,db,"SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename='business_records' OR tablename LIKE 'inventory_%' OR tablename IN ('capacities','storage_requirements','warehouse_assets')) ORDER BY tablename").split('\n').filter(Boolean)){assert(/^[a-z_]+$/.test(table));const predicate=table==='business_records'?" WHERE kind NOT IN ('connector','commerce-condition') AND NOT(data ? 'simulation')":'';result[i.key][db+'/'+table]=hash(query(i.key,db,`SELECT coalesce(jsonb_agg(to_jsonb(t)-'revision'-'updated_at' ORDER BY to_jsonb(t)->>'id'),'[]') FROM ${table} t${predicate}`));}
 }
}return result;}
const backup=path.resolve('.steward/backups/phase12-upgrade',new Date().toISOString().replaceAll(':','-'));await mkdir(backup,{recursive:true});privateDirectory(backup);await cp(directory,path.join(backup,'configuration'),{recursive:true});
for(const i of manifest.instances){const id=docker(['ps','-q','--filter','label=com.docker.compose.project='+manifest.project,'--filter','label=com.docker.compose.service='+i.key+'-db']);await writeFile(path.join(backup,i.key+'-databases.sql'),execFileSync('docker',['exec',id,'pg_dumpall','-U','postgres'],{maxBuffer:256*1024*1024}),{mode:0o600});}
const before=await snapshot(),configuration=await privateHashes();execFileSync(process.execPath,['tools/installer/dist/scientific-cli.js',directory],{stdio:'inherit'});const overlay=path.join(directory,'release/compose.yaml'),old=await readFile(overlay,'utf8');let service='';
const images={};for(const i of manifest.instances){images[i.key+'-api']=built.images[i.role+'-api'];images[i.key+'-web']=built.images[i.role+'-web'];if(i.role==='worker')images[i.key+'-module-host']=built.images['module-host'];}
images.scientific=built.images.scientific;
const updated=old.split('\n').map(line=>{const m=/^  ([a-z0-9-]+):$/.exec(line);if(m)service=m[1];return /^    image:/.test(line)&&images[service]?'    image: '+images[service]:line;}).join('\n')+(old.includes('  scientific:')?'':'\n  scientific:\n    image: '+built.images.scientific+'\n    pull_policy: never\n');await writeFile(overlay,updated);await selectDeployment(directory);
execFileSync('docker',['compose','up','-d','--wait','--wait-timeout','180'],{stdio:'inherit'});
assert.deepEqual(await snapshot(),before,'Preserve ordinary records, accounts, identities, module configurations and governance');const afterConfiguration=await privateHashes();for(const [file,hash]of Object.entries(configuration))assert.equal(afterConfiguration[file],hash,'Preserve private operator configuration '+file);for(const file of Object.keys(afterConfiguration))assert(file in configuration||file.startsWith('scientific'+path.sep),'Only additive scientific configuration is permitted');
for(const i of manifest.instances){assert.equal(query(i.key,'steward','SELECT max(version) FROM platform_migrations'),'15');assert.equal((await fetch('http://127.0.0.1:'+i.apiPort+'/ready')).status,200);assert.equal((await fetch('http://127.0.0.1:'+i.webPort)).status,200);}
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/phase12-selected-upgrade.json',JSON.stringify({status:'passed',sourceCommit,project:manifest.project,images,protectedSnapshot:hash(JSON.stringify(before)),privateConfigurationPreserved:true,backup,verifiedAt:new Date().toISOString()},null,2)+'\n');console.log('PASS Phase 12 core/schema upgrade in the selected stack; protected data and private configuration preserved.');
