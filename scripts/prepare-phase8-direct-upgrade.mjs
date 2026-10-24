// Populate an explicitly fresh two-installation v0.7 fixture through real operator/auth/enrollment APIs.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import path from 'node:path';
import {directory,manifest,compose,sql,json} from './lib.mjs';
import {privateDirectory} from '../tools/installer/dist/security.js';
const deployment=await manifest();assert.deepEqual(deployment.instances.map(i=>i.key),['master','worker-1']);
for(const i of deployment.instances)assert.equal((await json('http://127.0.0.1:'+i.apiPort+'/api/v1/platform')).release,'0.7.0');
const base=path.join(directory,'demo'),file=path.join(base,'presenter.json');await mkdir(base,{recursive:true});privateDirectory(base);
if(!existsSync(file)){
 for(const i of deployment.instances)assert.equal(sql(i.key,'SELECT count(*) FROM security_accounts'),'0','Use a fresh fixture; never appropriate existing accounts');
 const credentials={version:1,installations:deployment.instances.map(i=>i.installationId),entityA:randomUUID(),accounts:{}};for(const key of ['registry','worker-1'])credentials.accounts[key]={username:'upgrade-'+key+'-'+randomBytes(4).toString('hex'),password:randomBytes(32).toString('base64url')};await writeFile(file,JSON.stringify(credentials,null,2)+'\n',{flag:'wx',mode:0o600});
}
const credentials=JSON.parse(await readFile(file,'utf8'));assert.deepEqual(credentials.installations,deployment.instances.map(i=>i.installationId));
const overlays=['compose.yaml','network/compose.yaml','security/compose.yaml','modules/compose.yaml','data/compose.yaml','analyst/compose.yaml','release/compose.yaml'].filter(f=>existsSync(path.join(directory,f))).flatMap(f=>['-f',path.join(directory,f)]);
for(const [key,a]of Object.entries(credentials.accounts)){const service=key==='registry'?'master':key;assert.match(a.username,/^upgrade-[a-z0-9-]+$/);if(sql(service,"SELECT count(*) FROM security_accounts WHERE username='"+a.username+"'")==='0')execFileSync('docker',['compose',...overlays,'exec','-T',service+'-api','node','packages/platform/dist/security/admin-cli.js','--username',a.username,'--role',key==='registry'?'registry_admin':'local_admin','--password-stdin'],{input:a.password+'\n',stdio:['pipe','pipe','pipe']});}
process.env.STEWARD_SEED_CREDENTIALS_FILE=file;const {api,login,sessions,waitFor}=await import('./phase4-client.mjs');await login('master',credentials.accounts.registry);await login('worker-1',credentials.accounts['worker-1']);
await api('master','/api/v2/entities','PUT',{entityId:credentials.entityA,name:'Synthetic retained upgrade entity',classification:'synthetic-upgrade',enrollmentEligible:true});await api('master','/api/v2/authorizations','PUT',{accountId:sessions.master.account.account_id,entityId:credentials.entityA,allowed:true});
let state=(await api('worker-1','/api/v2/worker/status')).value;if(state.enrollmentState!=='enrolled'){await api('worker-1','/api/v2/worker/connection','PUT',{profileId:'master'});if(state.enrollmentState!=='pending')await api('worker-1','/api/v2/worker/start','POST',{requestId:randomUUID()});state=await waitFor(async()=>{const s=(await api('worker-1','/api/v2/worker/status')).value;return s.userCode?s:false;},'real v0.7 enrollment authorization');await api('master','/api/v2/enrollment/authorize','POST',{code:state.userCode,entityId:credentials.entityA});await api('master','/api/v2/enrollment/decision','POST',{requestId:state.requestId,entityId:credentials.entityA,decision:'approve'});await waitFor(async()=>(await api('worker-1','/api/v2/worker/status')).value.enrollmentState==='enrolled','v0.7 enrollment certificate');}
for(const [id,version,configuration,url,body,keyField]of [
 ['cee.inventory','1.3.2',{quantityUnit:'pieces',integrationsEnabled:true},'/items',{sku:'SYN-P8-UPGRADE-RETAIN',name:'Synthetic retained v0.7 stock',quantity:13,reservedQuantity:0,minStock:2},'sku'],
 ['cee.operations','1.0.0',{currency:'EUR'},'/capacities',{name:'Synthetic retained v0.7 capacity',site:'Synthetic upgrade site',capacity_m3:100,utilized_m3:20,monthly_operating_cost:25,currency:'EUR'},'name']
]){const existing=(await api('worker-1','/api/v3/modules')).value.installed.find(m=>m.moduleId===id);if(!existing)await api('worker-1','/api/v3/modules/install','POST',{packageId:id+'@'+version,operationId:randomUUID(),configuration});if(existing?.state!=='active')await api('worker-1','/api/v3/modules/'+id+'/lifecycle','POST',{action:'activate'});const route='/api/v3/modules/'+id+'/api'+url;if(!(await api('worker-1',route)).value.records.some(r=>r[keyField]===body[keyField]))await api('worker-1',route,'POST',body,201);}
await waitFor(async()=>(await api('master','/api/v4/analytics')).value.records.some(r=>r.module_id==='cee.operations'),'real v0.7 approved source synchronization');
console.log('PASS actual v0.7 operator accounts, trusted enrollment, signed modules, persistent inventory/configuration and synchronized operational records; no database shortcut');
