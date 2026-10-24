// Promote verified development images into the existing selected installation; never replace its identity.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {selectDeployment} from './select-deployment.mjs';
const selection=JSON.parse(await fs.readFile('.steward/operator/selection.json','utf8')),directory=selection.directory;
assert.equal(path.resolve(process.argv[2]??''),path.resolve(directory),'Explicitly name the currently selected existing deployment');
const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));assert.equal(selection.project,manifest.project);
const evidence=JSON.parse(await fs.readFile(process.argv[3]??'docs/phase10a-acceptance-evidence.json','utf8'));assert.equal(evidence.status,'passed');assert.equal(evidence.redeployment.status,'passed');
const run=(command,args)=>execFileSync(command,args,{encoding:'utf8',maxBuffer:128*1024*1024}).trim();
const docker=args=>run('docker',args),hash=s=>createHash('sha256').update(s).digest('hex');
const dbId=i=>docker(['ps','-q','--filter','label=com.docker.compose.project='+manifest.project,'--filter','label=com.docker.compose.service='+i.key+'-db']);
const query=(i,db,sql)=>docker(['exec',dbId(i),'psql','-U','postgres','-d',db,'-At','-v','ON_ERROR_STOP=1','-c',sql]);
const backup=path.resolve('.steward/backups',manifest.project,new Date().toISOString().replaceAll(':','-'));await fs.mkdir(backup,{recursive:true,mode:0o700});
await fs.cp(directory,path.join(backup,'configuration'),{recursive:true});
for(const i of manifest.instances){const dump=execFileSync('docker',['exec',dbId(i),'pg_dumpall','-U','postgres'],{maxBuffer:128*1024*1024});await fs.writeFile(path.join(backup,i.key+'-databases.sql'),dump,{mode:0o600});}
async function snapshot(){const result={};for(const i of manifest.instances){result[i.key]={};for(const table of ['platform_installation','security_accounts','entity_authorizations','enrolled_workers','local_enrollment','smart_bindings','smart_workflows','smart_obligations','smart_routes'])result[i.key][table]=hash(query(i,'steward',`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM ${table} t`));
 for(const db of query(i,'steward',"SELECT datname FROM pg_database WHERE datname LIKE 'm_%' AND datistemplate=false ORDER BY datname").split('\n').filter(Boolean)){assert(/^m_[a-f0-9]{20}$/.test(db));for(const table of query(i,db,"SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename='business_records' OR tablename LIKE 'inventory_%' OR tablename IN ('capacities','storage_requirements','warehouse_assets')) ORDER BY tablename").split('\n').filter(Boolean)){assert(/^[a-z_]+$/.test(table));result[i.key][db+'/'+table]=hash(query(i,db,`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM ${table} t`));}}}return result;}
const before=await snapshot(),images=evidence.redeployment.images;for(const image of new Set(Object.values(images)))assert.equal(JSON.parse(docker(['image','inspect',image]))[0].Id,image);
const release=path.join(directory,'release/compose.yaml'),old=await fs.readFile(release,'utf8');let service='';const changed=old.split('\n').map(line=>{const m=/^  ([a-z0-9-]+):$/.exec(line);if(m)service=m[1];return /^    image:/.test(line)&&images[service]?'    image: '+images[service]:line;}).join('\n');await fs.writeFile(release,changed);
await selectDeployment(directory);execFileSync('docker',['compose','up','-d','--wait','--wait-timeout','180'],{stdio:'inherit'});
assert.deepEqual(await snapshot(),before,'Existing identities, accounts, authorization, governed obligations and authoritative business data must remain unchanged');
async function compareConfiguration(relative=''){for(const f of await fs.readdir(path.join(backup,'configuration',relative),{withFileTypes:true})){const name=path.join(relative,f.name);if(name==='release')continue;if(f.isDirectory())await compareConfiguration(name);else assert.equal(hash(await fs.readFile(path.join(directory,name))),hash(await fs.readFile(path.join(backup,'configuration',name))),'Operator configuration changed: '+name);}}
await compareConfiguration();
for(const i of manifest.instances){assert.equal((await fetch('http://127.0.0.1:'+i.apiPort+'/ready')).status,200);assert.equal((await fetch('http://127.0.0.1:'+i.webPort)).status,200);}
const report={verifiedAt:new Date().toISOString(),project:manifest.project,sourceCommit:evidence.runtimeSourceCommit,images,backup,identityAccountsAuthorizationGovernanceAndBusinessDataPreserved:true,readiness:'all four APIs/frontends HTTP 200',status:'passed'};
await fs.writeFile(path.join(directory,'release/development-upgrade.json'),JSON.stringify(report,null,2)+'\n');await fs.writeFile('artifacts/selected-stack-upgrade.json',JSON.stringify(report,null,2)+'\n');console.log('PASS verified development images promoted into existing selected stack with all protected data preserved; private backups retained.');
