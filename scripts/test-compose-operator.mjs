import {test} from 'node:test';
import assert from 'node:assert/strict';
import {operatorConfig,selectionEnv} from './select-deployment.mjs';
import {stopOwnedModules} from './compose-stop-modules.mjs';
test('selection requires secure web/API configuration and preserves existing resource identities',()=>{
 const manifest={project:'existing',instances:[{key:'worker-1',webPort:5201}]};
 assert.throws(()=>operatorConfig({name:'existing',services:{}},manifest,'hook'),/HTTPS/);
 const config={name:'existing',volumes:{db:{name:'existing-data'}},services:{'worker-1-api':{environment:{STEWARD_SECURITY_FILE:'private'}},'worker-1-web':{ports:[{target:8443,published:'6201'}]},'worker-1-module-host':{environment:{MODULE_HOST_CONFIG:'identity'},volumes:[]}}};
 const result=operatorConfig(config,manifest,'hook');assert.equal(result.volumes.db.name,'existing-data');assert.equal(result.services['worker-1-module-host'].pre_stop[0].command[0],'node');
 assert.throws(()=>operatorConfig({...config,name:'another'},manifest,'hook'),/identity/);
});
test('local selection preserves unrelated environment configuration',()=>{
 const result=selectionEnv('MY_SETTING=keep\nSTEWARD_COMPOSE_PROJECT=old\n','existing');assert.match(result,/MY_SETTING=keep/);assert.equal((result.match(/STEWARD_COMPOSE_PROJECT=/g)??[]).length,1);assert.match(result,/STEWARD_COMPOSE_PROJECT=existing/);assert.equal(selectionEnv(result,'existing'),result);
});
const installationId='11111111-1111-4111-8111-111111111111',Id='a'.repeat(64),Labels={'steward.installation':installationId,'steward.managed-by':'module-host-v1','steward.module':'example.inventory'};
test('Compose shutdown stops only owned disposable modules without deleting data volumes',async()=>{
 const calls=[];assert.equal(await stopOwnedModules({installationId},async(method,url)=>{calls.push({method,url});return method==='GET'?[{Id,Labels}]:undefined;}),1);
 assert.deepEqual(calls.map(c=>c.method),['GET','POST','DELETE']);assert(!calls[2].url.includes('v='));assert(!calls[2].url.includes('force'));
});
test('ownership mismatch or stop failure never deletes a container',async()=>{
 const calls=[];await assert.rejects(stopOwnedModules({installationId},async(method,url)=>{calls.push(method);return [{Id,Labels:{...Labels,'steward.installation':'another'}}];}),/ownership/);assert.deepEqual(calls,['GET']);
 await assert.rejects(stopOwnedModules({installationId},async(method)=>{if(method==='GET')return[{Id,Labels}];if(method==='POST')throw Error('stop failed');assert.fail('must not delete');}),/stop failed/);
});

import {unexpectedStewardContainers} from './verify-single-stack.mjs';
test('single-stack audit accepts selected core and owned dynamic modules',()=>{const selected={project:'steward-current',instances:[{installationId}]};const c=Labels=>({Config:{Labels}});assert.deepEqual(unexpectedStewardContainers([c({'com.docker.compose.project':'steward-current'}),c({'steward.managed-by':'module-host-v1','steward.installation':installationId}),c({'com.docker.compose.project':'unrelated-app'})],selected),[]);});
test('single-stack audit detects obsolete stacks and orphaned module services',()=>{const selected={project:'steward-current',instances:[{installationId}]};const old={Config:{Labels:{'com.docker.compose.project':'steward-old'}}},orphan={Config:{Labels:{'steward.managed-by':'module-host-v1','steward.installation':'other'}}};assert.deepEqual(unexpectedStewardContainers([old,orphan],selected),[old,orphan]);});
