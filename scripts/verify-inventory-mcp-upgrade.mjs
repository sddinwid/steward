import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {compose,docker} from './lib.mjs';
import {logins,api,deployment} from './phase4-client.mjs';
const snapshot=()=>Object.fromEntries(deployment.instances.flatMap(i=>['api','web'].map(kind=>{const key=i.key+'-'+kind,c=JSON.parse(docker(['inspect',compose('ps','-q',key)]))[0];return[key,{image:c.Image,container:c.Id,startedAt:c.State.StartedAt}];})));
await logins();const before=snapshot();
for(const w of ['worker-1','worker-2','worker-3']){
 const installed=(await api(w,'/api/v3/modules')).value.installed.find(m=>m.moduleId==='cee.inventory');
 const records=(await api(w,'/api/v3/modules/cee.inventory/api/items')).value.records;
 if(installed.version!=='1.2.1'){
  await api(w,'/api/v3/modules/install','POST',{packageId:'cee.inventory@1.2.1',operationId:randomUUID(),configuration:installed.configuration,upgrade:true});
  await api(w,'/api/v3/modules/cee.inventory/lifecycle','POST',{action:'activate'});
 }
 assert.deepEqual((await api(w,'/api/v3/modules/cee.inventory/api/items')).value.records,records);
 // Inspect the actual module through the provider-managed known identity.
 const moduleRows=docker(['ps','-q','--filter','label=steward.installation='+deployment.instances.find(i=>i.key===w).installationId]);
 for(const id of moduleRows.split('\n').filter(Boolean)){
  const c=JSON.parse(docker(['inspect',id]))[0];if(c.Config.Labels['steward.module.id']!=='cee.inventory'&&c.Config.Labels['steward.module']!=='cee.inventory')continue;
  docker(['exec',id,'node','-e',"const fs=require('fs'),p=JSON.parse(fs.readFileSync('package.json'));if(p.dependencies['steward-platform']||fs.existsSync('/app/packages/platform')||fs.existsSync('node_modules/steward-platform'))process.exit(1)"]);
 }
 console.log('PASS '+w+': signed Inventory 1.2.1 upgrade preserves all item records');
}
const after=snapshot();assert.deepEqual(after,before);
await writeFile('artifacts/phase5-inventory-upgrade.json',JSON.stringify({verifiedAt:new Date().toISOString(),before,after,assertions:'all passed'},null,2)+'\n');
console.log('PASS all Master/Worker core images, container IDs and process start times unchanged during module patch upgrades');
