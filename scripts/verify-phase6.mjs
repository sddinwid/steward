// Acceptance checks against a dedicated, already bootstrapped release demo.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {directory,manifest,compose,sql,docker,json} from './lib.mjs';
const deployment=await manifest(),bundle=path.resolve(process.env.STEWARD_RELEASE_BUNDLE??'artifacts/releases/steward-0.6.0');
process.env.STEWARD_SEED_CREDENTIALS_FILE=path.join(directory,'demo/presenter.json');
process.env.STEWARD_DEMO_RETRY_LOGIN='1';
const {api,logins}=await import('./phase4-client.mjs');
const report={startedAt:new Date().toISOString(),project:deployment.project,checks:[]};
const run=(script,args=[])=>execFileSync(process.execPath,[script,...args],{stdio:'inherit',timeout:900000,env:{...process.env,STEWARD_DEPLOYMENT:directory}});
const hash=s=>createHash('sha256').update(s).digest('hex');
async function configHashes(){const out={};for(const f of await readdir(directory,{recursive:true,withFileTypes:true}))if(f.isFile()){
 const p=path.join(f.parentPath,f.name),relative=path.relative(directory,p).replaceAll('\\','/');
 if(!relative.startsWith('demo/')&&!relative.startsWith('release/'))out[relative]=hash(await readFile(p));
}return out;}
const pass=s=>{report.checks.push(s);console.log('PASS '+s);};
const dbSnapshot=()=>Object.fromEntries(deployment.instances.map(i=>[i.key,{
 identity:sql(i.key,'SELECT installation_id FROM platform_installation'),
 accounts:hash(sql(i.key,'SELECT row_to_json(a) FROM security_accounts a ORDER BY account_id')),
 enrollment:hash(sql(i.key,'SELECT row_to_json(e) FROM local_enrollment e')),
 modules:hash(sql(i.key,"SELECT to_jsonb(m)-'updated_at' FROM module_installations m ORDER BY module_id")),
 databases:compose('exec','-T',i.key+'-db','psql','-U','postgres','-At','-c','SELECT datname FROM pg_database ORDER BY datname')
} ]));
await mkdir('artifacts',{recursive:true});
try{
 await logins();
 const initial=JSON.parse(await readFile(path.join(directory,'demo/module-evidence.json'),'utf8'));assert.equal(initial.initiallyAbsent,true);assert.equal(initial.browserInstalled,true);assert.equal(initial.coreUnchanged,true);report.module=initial;
 for(const key of ['worker-2','worker-3'])assert.ok(!(await api(key,'/api/v3/modules')).value.installed.some(m=>m.moduleId==='cee.inventory'));
 const coreImages=Object.fromEntries(deployment.instances.filter(i=>i.role==='worker').map(i=>[i.key,JSON.parse(docker(['inspect',compose('ps','-q',i.key+'-api')]))[0].Image]));assert.equal(new Set(Object.values(coreImages)).size,1);assert.deepEqual(coreImages,initial.coreImages);report.coreImages=coreImages;
 pass('Fresh browser Inventory installation, persistent record, unchanged identical Worker images and Inventory absent on Workers 2/3');
 for(const i of deployment.instances)assert.equal(sql(i.key,'SELECT installation_id FROM platform_installation'),i.installationId);
 assert.equal(new Set(deployment.instances.map(i=>i.installationId)).size,4);
 pass('Clean Master plus three independent databases and cryptographic installation identities');
 const baseline=await configHashes(),databases=dbSnapshot();
 const counts=Object.fromEntries(await Promise.all(['worker-1','worker-2','worker-3'].map(async key=>[key,(await api(key,'/api/v3/modules/cee.operations/api/'+(key==='worker-1'?'capacities':key==='worker-2'?'storage':'assets'))).value.records.length])));
 run('scripts/demo.mjs',[directory,'seed']);run('scripts/demo.mjs',[directory,'seed']);
 for(const [key,count]of Object.entries(counts))assert.equal((await api(key,'/api/v3/modules/cee.operations/api/'+(key==='worker-1'?'capacities':key==='worker-2'?'storage':'assets'))).value.records.length,count);
 pass('Repeated authenticated scenario provisioning produces no duplicate operational records');
 const route='/api/v3/modules/cee.operations/api/capacities';
 const unrelated=(await api('worker-1',route,'POST',{name:'Unrelated acceptance record '+randomUUID().slice(0,8),site:'Separate site',capacity_m3:1,utilized_m3:1,monthly_operating_cost:1,currency:'EUR'},201)).value.record;
 const owned=JSON.parse(await readFile(path.join(directory,'demo/owned-records.json'),'utf8'));
 const row=(await api('worker-1',route)).value.records.find(r=>r.id===owned.records['worker-1/manufacturing-1']);
 const {id,available_m3,...body}=row;await api('worker-1',route+'/'+id,'PUT',{...body,monthly_operating_cost:row.monthly_operating_cost+17});
 run('scripts/demo.mjs',[directory,'reset']);
 assert.deepEqual((await api('worker-1',route)).value.records.find(r=>r.id===unrelated.id),unrelated);
 const afterReset=(await api('worker-1',route)).value.records.find(r=>r.id===id);assert.equal(afterReset.monthly_operating_cost,4800);
 run('scripts/demo.mjs',[directory,'reset']);assert.deepEqual((await api('worker-1',route)).value.records.find(r=>r.id===id),afterReset);
 assert.deepEqual(await configHashes(),baseline);assert.deepEqual(dbSnapshot(),databases);
 pass('Owned-record reset restores baseline, preserves unrelated data/configuration/credentials/enrollment, and repeated reset is a no-op');
 run('scripts/demo.mjs',[directory,'outage']);run('scripts/demo.mjs',[directory,'reset']);report.outage=JSON.parse(await readFile(path.join(directory,'demo/outage.json'),'utf8'));
 pass('Master outage, offline Worker write/restart, persistent enrollment and exact durable revision catch-up');
 const inventory=(await api('worker-1','/api/v3/modules/cee.inventory/api/items')).value.records;
 const beforeInstall=await configHashes(),beforeDb=dbSnapshot();
 run('scripts/release.mjs',['install','--bundle',bundle,'--directory',directory,'--trust-bundled-modules']);
 run('scripts/release.mjs',['upgrade','--bundle',bundle,'--directory',directory,'--trust-bundled-modules']);
 assert.deepEqual(await configHashes(),beforeInstall);assert.deepEqual(dbSnapshot(),beforeDb);
 run('scripts/release.mjs',['stop','--directory',directory]);run('scripts/release.mjs',['start','--directory',directory]);
 for(const i of deployment.instances)await json('http://127.0.0.1:'+i.apiPort+'/ready');
 assert.deepEqual(dbSnapshot(),beforeDb);assert.deepEqual((await api('worker-1','/api/v3/modules/cee.inventory/api/items')).value.records,inventory);
 pass('Repeated release installation, explicit upgrade and full container recreation retain private config bytes, accounts, certificates, module states and every Inventory record');
 const malformed=path.resolve('artifacts/phase6-invalid-release');await mkdir(malformed,{recursive:true});
 await writeFile(path.join(malformed,'payload.txt'),'tampered');await writeFile(path.join(malformed,'release.json'),JSON.stringify({formatVersion:1,version:'0.6.0',files:{'payload.txt':hash('original')}}));
 let rejected=false;try{execFileSync(process.execPath,['scripts/release.mjs','install','--bundle',malformed,'--directory',directory,'--trust-bundled-modules'],{stdio:'pipe'});}catch(e){rejected=e.status===1&&e.stderr.toString().includes('checksum mismatch');}assert.ok(rejected);assert.deepEqual(await configHashes(),beforeInstall);assert.deepEqual(dbSnapshot(),beforeDb);
 pass('Tampered release rejected before deployment mutation; existing identities/data/configuration remain intact');
 run('scripts/smoke.mjs',[directory]);run('scripts/browser-smoke.mjs',[directory]);
 report.finishedAt=new Date().toISOString();report.status='passed';
}catch(e){report.status='failed';report.failure=e.message;process.exitCode=1;console.error('Phase 6 acceptance failed: '+e.message);}
finally{await writeFile('artifacts/phase6-acceptance.json',JSON.stringify(report,null,2)+'\n');}
