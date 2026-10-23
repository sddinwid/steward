// Operator-authorized republication of retained, verified baseline artifacts.
// Imports catalog entries only; no module is installed or started.
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {verifyPackage,signPackage,canonical} from '../packages/module-sdk/dist/index.js';
const [sourceArg,targetArg,...ids]=process.argv.slice(2);if(!sourceArg||!targetArg||!ids.length)throw Error('Usage: node scripts/import-trusted-packages.mjs SOURCE_DEPLOYMENT TARGET_DEPLOYMENT module@version [...]');
const source=path.resolve(sourceArg),target=path.resolve(targetArg),original=JSON.parse(await readFile(path.join(source,'modules/public/catalog.json'),'utf8')),trust=JSON.parse(await readFile(path.join(source,'modules/public/trust.json'),'utf8'));
const file=path.join(target,'modules/public/catalog.json'),catalog=JSON.parse(await readFile(file,'utf8')),key=await readFile(path.join(target,'security/module-publisher-key.pem'),'utf8');let changed=false;
for(const id of ids){const descriptor=original.packages.find(p=>p.payload.manifest.moduleId+'@'+p.payload.manifest.version===id);if(!descriptor)throw Error('Retained package missing: '+id);const payload=verifyPackage(descriptor,trust);if(payload.publisherId!=='local-operator')throw Error('This helper only republishes locally retained operator packages; external publishers require explicit release provenance review');const actual=JSON.parse(execFileSync('docker',['image','inspect',payload.imageId],{encoding:'utf8'}))[0].Id;if(actual!==payload.imageId)throw Error('Verified baseline image is unavailable');const signed=signPackage(payload,key),existing=catalog.packages.find(p=>p.payload.manifest.moduleId+'@'+p.payload.manifest.version===id);if(existing&&canonical(existing)!==canonical(signed))throw Error('Immutable package version conflict: '+id);if(!existing){catalog.packages.push(signed);changed=true;}}
if(changed)await writeFile(file,JSON.stringify(catalog,null,2)+'\n');console.log('Verified retained package authenticity and local image digests; '+(changed?'imported ':'preserved ')+ids.join(', ')+'. No module installation performed.');
