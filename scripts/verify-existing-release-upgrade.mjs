import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {digest} from '../packages/module-sdk/dist/index.js';
import {directory,manifest,compose,sql,docker,json} from './lib.mjs';
const bundle=path.resolve(process.env.STEWARD_RELEASE_BUNDLE??'artifacts/releases/steward-0.6.0'),deployment=await manifest();
const hash=s=>createHash('sha256').update(s).digest('hex');
async function files(){const out={};for(const e of await readdir(directory,{recursive:true,withFileTypes:true}))if(e.isFile()){
 const f=path.join(e.parentPath,e.name),name=path.relative(directory,f).replaceAll('\\','/');if(!name.startsWith('release/')&&!name.startsWith('demo/'))out[name]=hash(await readFile(f));
}return out;}
function snapshots(){return Object.fromEntries(deployment.instances.map(i=>{
 const state={identity:sql(i.key,'SELECT installation_id FROM platform_installation'),accounts:hash(sql(i.key,'SELECT row_to_json(a) FROM security_accounts a ORDER BY account_id')),enrollment:hash(sql(i.key,'SELECT row_to_json(e) FROM local_enrollment e')),modules:hash(sql(i.key,"SELECT to_jsonb(m)-'updated_at' FROM module_installations m ORDER BY module_id"))};
 if(i.role==='worker'){
  for(const [id,tables]of [['cee.inventory',['inventory_items']],['cee.operations',['capacities','storage_requirements','warehouse_assets']]])for(const table of tables)state[id+'/'+table]=hash(compose('exec','-T',i.key+'-db','psql','-U','postgres','-d','m_'+digest(id).slice(0,20),'-At','-v','ON_ERROR_STOP=1','-c','SELECT row_to_json(r) FROM '+table+' r ORDER BY '+(table==='inventory_items'?'item_id':'id')));
 }else state.findings=hash(sql(i.key,'SELECT row_to_json(f) FROM analytical_findings f ORDER BY finding_id'));
 return[i.key,state];
}));}
const images=()=>Object.fromEntries(deployment.instances.flatMap(i=>['api','web'].map(k=>[i.key+'-'+k,JSON.parse(docker(['inspect',compose('ps','-q',i.key+'-'+k)]))[0].Image])));
const run=(script,args)=>execFileSync(process.execPath,[script,...args],{stdio:'inherit',timeout:900000,env:{...process.env,STEWARD_DEPLOYMENT:directory}});
const beforeFiles=await files(),beforeDb=snapshots(),beforeImages=images();
run('scripts/release.mjs',['upgrade','--bundle',bundle,'--directory',directory,'--trust-bundled-modules']);
run('scripts/release.mjs',['stop','--directory',directory]);run('scripts/release.mjs',['start','--directory',directory]);
for(const i of deployment.instances)await json('http://127.0.0.1:'+i.apiPort+'/ready');
assert.deepEqual(await files(),beforeFiles);assert.deepEqual(snapshots(),beforeDb);assert.deepEqual(images(),beforeImages);
let refused=false;try{execFileSync(process.execPath,['scripts/demo.mjs',directory,'setup'],{stdio:'pipe',timeout:30000});}catch(e){refused=e.status===1&&e.stderr.toString().includes('requires fresh accounts');}assert.ok(refused,'Demo bootstrap must reject existing operator accounts');assert.deepEqual(await files(),beforeFiles);assert.deepEqual(snapshots(),beforeDb);
await writeFile('artifacts/phase6-existing-upgrade.json',JSON.stringify({verifiedAt:new Date().toISOString(),project:deployment.project,status:'passed',privateFilesPreserved:Object.keys(beforeFiles).length,identitiesAccountsEnrollmentModuleConfigurationAndAuthoritativeRecordsPreserved:true,existingFindingHistoryPreserved:true,coreImagesUnchanged:beforeImages,existingOperatorDemoBootstrapRejected:true,installedRelease:JSON.parse(await readFile(path.join(directory,'release/installed.json'),'utf8')).version},null,2)+'\n');
console.log('PASS existing seeded installation upgrades to release packaging without image, identity, secret/configuration, business-record or finding loss; unsafe demo bootstrap refused.');
