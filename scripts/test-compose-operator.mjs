import {test} from 'node:test';
import assert from 'node:assert/strict';
import {operatorConfig,selectionEnv,deploymentOverlayFiles} from './select-deployment.mjs';
import path from 'node:path';
test('Catalog secure routing is optional for legacy deployments and follows economy before release',()=>{const directory=path.resolve('isolated-overlay-order'),base=new Set(['compose.yaml','security/compose.yaml','mission/compose.yaml','economy/compose.yaml','release/compose.yaml']),available=p=>base.has(path.relative(directory,p).replaceAll('\\','/'));const legacy=deploymentOverlayFiles(directory,available);assert(!legacy.includes('catalog/compose.yaml'));base.add('catalog/compose.yaml');const current=deploymentOverlayFiles(directory,available);assert.deepEqual(current.filter(f=>f!=='catalog/compose.yaml'),legacy);assert.equal(current.indexOf('catalog/compose.yaml'),current.indexOf('economy/compose.yaml')+1);assert.equal(current.indexOf('release/compose.yaml'),current.indexOf('catalog/compose.yaml')+1);});
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


test('Workflow secure routing is additive after Catalog and before the release image overlay',()=>{
 const directory=path.resolve('isolated-workflow-overlay-order');
 const base=new Set(['compose.yaml','security/compose.yaml','catalog/compose.yaml','release/compose.yaml']);
 const available=p=>base.has(path.relative(directory,p).replaceAll('\\','/'));
 const legacy=deploymentOverlayFiles(directory,available);
 assert(!legacy.includes('automation/compose.yaml'));
 base.add('automation/compose.yaml');const current=deploymentOverlayFiles(directory,available);
 assert.deepEqual(current.filter(f=>f!=='automation/compose.yaml'),legacy);
 assert.equal(current.indexOf('automation/compose.yaml'),current.indexOf('catalog/compose.yaml')+1);
 assert.equal(current.indexOf('release/compose.yaml'),current.indexOf('automation/compose.yaml')+1);
});


import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
test('shared acceptance helper fails before Docker when an explicit deployment is missing',()=>{
 const missing=path.join(tmpdir(),'steward-missing-'+randomUUID()),library=new URL('./lib.mjs',import.meta.url).href;
 const script=`process.argv[2]=${JSON.stringify(missing)};const {compose}=await import(${JSON.stringify(library)});try{compose('up','-d');process.exit(2);}catch(error){if(!error.message.includes('Existing deployment Compose configuration required'))throw error;}`;
 execFileSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,PATH:''},stdio:'pipe'});
});
