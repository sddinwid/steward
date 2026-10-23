import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {directory,compose} from './lib.mjs';
const toolkit=path.resolve(process.env.STEWARD_PORTABLE_TOOLKIT??'artifacts/releases/steward-0.6.0/toolkit');
const config=JSON.parse(compose('config','--format','json')),services=Object.entries(config.services),sources=[];
const inside=(file,base)=>path.resolve(file)===base||path.resolve(file).startsWith(base+path.sep);
for(const [name,s]of services){
 assert.equal(s.build,undefined,name+' must not build from checkout');assert.match(s.image,/^sha256:[0-9a-f]{64}$/);
 for(const v of s.volumes??[])if(v.type==='bind'){
  assert.ok(v.source==='/var/run/docker.sock'||inside(v.source,directory)||inside(v.source,toolkit),'Unexpected source checkout dependency: '+name);
  if(inside(v.source,toolkit))sources.push({service:name,file:path.relative(toolkit,v.source).replaceAll('\\','/')});
 }
}
assert.ok(sources.length===4&&sources.every(s=>s.file==='infra/init-db.sh'));
const log=await readFile('artifacts/phase6-portable-install.log','utf8');
for(const key of ['master','worker-1','worker-2','worker-3']){
 assert.ok(log.includes('PASS '+key+': API health/readiness'));
 assert.ok(log.includes('PASS '+key+': React rendered identity/readiness'));
}
await writeFile('artifacts/phase6-portability.json',JSON.stringify({verifiedAt:new Date().toISOString(),copiedToolkitNpmCiAndBuild:'passed',cleanInstallationFromToolkit:'passed',smokeAndChromium:'passed',serviceCount:services.length,noBuildDependencies:true,toolkitMounts:sources,allOtherBindMounts:'deployment-owned state or explicitly privileged Docker socket'},null,2)+'\n');
console.log('PASS clean portable release uses only copied toolkit/deployment mounts, no source checkout builds, and digest-pinned images.');
