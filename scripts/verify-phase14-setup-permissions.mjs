// Reversible acceptance: repeat controlled setup must not undo operator revocation.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {api,logins,sessions,directory,sql} from './phase13-acceptance-client.mjs';
import {login} from './phase4-client.mjs';
const state=JSON.parse(await readFile(path.join(directory,'demo/phase14-economy.json'),'utf8'));
const worker='worker-1',moduleId='steward.finance.mission-budget',account=state.controllers[worker];
assert.match(account.accountId,/^[a-f0-9-]{36}$/);assert(state.setupCompletedAt);
const prior=JSON.parse(sql(worker,`SELECT coalesce(json_agg(permission ORDER BY permission),'[]') FROM module_permissions WHERE account_id='${account.accountId}' AND module_id='${moduleId}'`));
assert(prior.length);const report={startedAt:new Date().toISOString(),status:'in-progress',checks:[]};
try{
 await logins();await api(worker,'/api/v3/modules/permissions','PUT',{accountId:account.accountId,moduleId,permissions:[]});
 const original=sessions[worker],reviewer=await login(worker,{username:account.username,password:(await readFile(path.join(directory,account.passwordFile),'utf8')).trim()});sessions[worker]=original;
 await api(worker,'/api/v3/modules/'+moduleId+'/api/programs','GET',undefined,403,reviewer);
 const {report:setup}=await import('./seed-phase14-economy.mjs');assert.equal(setup.status,'passed');
 assert.equal(sql(worker,`SELECT count(*) FROM module_permissions WHERE account_id='${account.accountId}' AND module_id='${moduleId}'`).trim(),'0');
 await api(worker,'/api/v3/modules/'+moduleId+'/api/programs','GET',undefined,403,reviewer);
 report.checks.push('Existing controller revocation survives repeated setup; original account remains forbidden before and after setup.');report.status='passed';
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;console.error(e.message);}
finally{await api(worker,'/api/v3/modules/permissions','PUT',{accountId:account.accountId,moduleId,permissions:prior});report.restoredExactPriorPermissions=true;report.finishedAt=new Date().toISOString();await writeFile('artifacts/phase14-setup-permission-preservation.json',JSON.stringify(report,null,2)+'\n');console.log('Setup permission preservation: '+report.status);}
