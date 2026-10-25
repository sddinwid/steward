// Development source generation only. Publish/release commands never mutate manifests.
import {readFile,writeFile} from 'node:fs/promises';
import {simulationContracts,consumes,provides} from '../packages/simulation-kit/dist/index.js';
import {validateManifest} from '../packages/module-sdk/dist/index.js';
for(const name of ['sales','stock-ledger','simulation-commerce','simulation-fulfillment']){
 const file='modules/'+name+'/manifest.json',m=JSON.parse(await readFile(file,'utf8'));
 for(const [key,contract]of Object.entries(simulationContracts)){
  const provider=m.smart.provides.find(c=>c.capabilityId===contract.id);
  if(provider){const next=provides(key,m.moduleId);next.operations.forEach(o=>o.permission=provider.operations[0].permission);if(m.simulation.role==='participant')next.configuration={simulationEnabled:true};Object.assign(provider,next);}
  const consumer=m.smart.consumes.find(c=>c.capabilityId===contract.id);if(consumer)Object.assign(consumer,consumes(key));
 }
 validateManifest(m);await writeFile(file,JSON.stringify(m,null,2)+'\n');
}
