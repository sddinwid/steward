// Offline publication guard: manifest, SQL, npm identity and container metadata
// must agree before any module is signed. No images/services are started.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {digest,validateManifest} from '../packages/module-sdk/dist/index.js';
for(const directory of ['catalog','pricing','sales','inventory','stock-ledger','procurement','housing-management','services-food','workforce'])await test(directory+': independently packaged identity and exact append-only migration declarations agree',async()=>{
 const root='modules/'+directory,manifest=JSON.parse(await readFile(root+'/manifest.json','utf8')),pkg=JSON.parse(await readFile(root+'/package.json','utf8')),lock=JSON.parse(await readFile(root+'/package-lock.json','utf8')),dockerfile=await readFile(root+'/Dockerfile','utf8');
 validateManifest(manifest);assert.equal(manifest.minimumPlatformVersion,'0.15.0');assert.equal(pkg.version,manifest.version);assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
 for(const dependency of ['@steward/platform','@steward/master-api','@steward/worker-api','@steward/master-web','@steward/worker-web'])assert(!Object.hasOwn(pkg.dependencies??{},dependency),'Core application dependency: '+dependency);
 assert(dockerfile.includes('steward.module.id="'+manifest.moduleId+'"'));assert(dockerfile.includes('steward.module.version="'+manifest.version+'"'));assert(dockerfile.includes('USER 1000:1000'));
 const names=(await readdir(root+'/migrations')).filter(f=>/^\d{3}-[a-z-]+\.sql$/.test(f)).sort();assert.equal(names.length,manifest.persistence.schemaVersion);
 for(let i=0;i<names.length;i++)assert.deepEqual(manifest.persistence.migrations[i],{version:i+1,sha256:digest(await readFile(root+'/migrations/'+names[i],'utf8'))});
 const apiIds=manifest.api.map(a=>a.operationId);for(const screen of manifest.ui){if(screen.listOperation)assert(apiIds.includes(screen.listOperation));for(const action of screen.actions??[])assert(apiIds.includes(action.operationId));}
});
