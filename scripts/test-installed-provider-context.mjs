import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {canonical,digest,signPackage} from '../packages/module-sdk/dist/index.js';
import {installedProviderHeaders} from '../packages/module-host/dist/installed-providers.js';
import {publicContextHeaders} from '../packages/module-host/dist/financial-context.js';
import {installedCapabilityContext} from '../packages/business-kit/dist/index.js';

const consumer=JSON.parse(await readFile('modules/pricing/manifest.json','utf8'));
const source=JSON.parse(await readFile('modules/procurement/manifest.json','utf8'));
const keys=generateKeyPairSync('ed25519'),secret=keys.privateKey.export({type:'pkcs8',format:'pem'}).toString();
const trust={publishers:[{publisherId:'fixture',publicKey:keys.publicKey.export({type:'spki',format:'pem'}).toString()}]};
const worker=randomUUID(),entity=randomUUID(),operation=randomUUID();
const descriptor=signPackage({formatVersion:1,publisherId:'fixture',imageId:'sha256:'+'b'.repeat(64),manifest:source},secret);
const row={module_id:source.moduleId,version:source.version,state:'active',configuration:{costReadEnabled:true,integrationsEnabled:false},operation_id:operation,descriptor,entity_id:entity};
const runtime={installationId:worker,entityId:entity};
const db=rows=>({query:async sql=>{assert.match(sql,/local_enrollment/);assert.match(sql,/i.state='active'/);assert.match(sql,/LIMIT 65/);return{rows};}});
const config={costReadEnabled:true,integrationsEnabled:false};
const raw=async(rows,cfg=config,m=consumer)=>(await installedProviderHeaders(db(rows),m,cfg,trust))['x-steward-installed-providers'];
const parsed=value=>installedCapabilityContext(runtime,value).installedCapabilityProviders;

test('verified current provider facts use original operation/package and trusted runtime entity',async()=>{
 const h=await raw([row]),p=parsed(h);assert.equal(p.complete,true);assert.equal(p.providers.length,1);
 assert.deepEqual(p.providers[0],{capabilityId:'costs.procurement.read',configurationDigest:digest(canonical(row.configuration)),provider:{workerInstallationId:worker,entityId:entity,moduleId:source.moduleId,moduleInstallationId:operation,packageDigest:digest(canonical(descriptor))}});
 assert(Object.isFrozen(p));assert(Object.isFrozen(p.providers));assert(Object.isFrozen(p.providers[0].provider));
});

test('inactive, disabled, uninstalled, unsigned or mismatched providers cannot remain current',async()=>{
 for(const rows of [[],[{...row,state:'inactive'}],[{...row,configuration:{costReadEnabled:false,integrationsEnabled:true}}],[{...row,descriptor:{...descriptor,signature:'forged'}}],[{...row,version:'99.0.0'}]])assert.equal(parsed(await raw(rows)).providers.length,0);
 assert.equal(parsed(await raw([row],{costReadEnabled:false,integrationsEnabled:true})).providers.length,0);
 const newOperation=randomUUID(),next=parsed(await raw([{...row,operation_id:newOperation}]));assert.equal(next.providers[0].provider.moduleInstallationId,newOperation);assert.notEqual(next.providers[0].provider.moduleInstallationId,operation);
});

test('public configuration corrections change the independent fingerprint while original provider pins remain identical',async()=>{
 const original=parsed(await raw([row])).providers[0];
 for(const patch of [{currency:'EUR'},{mode:'live'},{costObservationMaxAgeSeconds:10}]){
  const next=parsed(await raw([{...row,configuration:{...row.configuration,...patch}}])).providers[0];
  assert.deepEqual(next.provider,original.provider);assert.notEqual(next.configurationDigest,original.configurationDigest);
 }
 const text=await raw([{...row,configuration:{...row.configuration,currency:'USD'}}]);assert(!text.includes('currency'));assert(!text.includes('USD'));
});

test('legacy consumers are unchanged and an incomplete registry is explicit rather than a guessed absence',async()=>{
 assert.equal(await raw([row],config,{...consumer,minimumPlatformVersion:'0.14.0'}),undefined);
 assert.equal(await raw([row],config,{...consumer,smart:undefined}),undefined);
 const p=parsed(await raw(Array.from({length:65},()=>row)));assert.equal(p.complete,false);assert.deepEqual(p.providers,[]);
 const invalid=parsed(await raw([{...row,operation_id:'not-an-identity'}]));assert.equal(invalid.complete,false);
});

test('too many compatible providers produce bounded incomplete context, never a partial current allowlist',async()=>{
 const rows=Array.from({length:13},(_,n)=>{const m=JSON.parse(JSON.stringify(source).replaceAll(source.moduleId,'test.supplier'+n));return{...row,module_id:m.moduleId,operation_id:randomUUID(),descriptor:signPackage({formatVersion:1,publisherId:'fixture',imageId:'sha256:'+'b'.repeat(64),manifest:m},secret)};});
 const h=await raw(rows);assert(Buffer.byteLength(h)<=4096);const p=parsed(h);assert.equal(p.complete,false);assert.deepEqual(p.providers,[]);
});

test('private provider snapshots reject stale, future, duplicate, foreign-body and oversized frames',async t=>{
 const value=JSON.parse(await raw([row]));const reject=v=>assert.throws(()=>parsed(JSON.stringify(v)),/context unavailable/);
 const now=Date.now();t.mock.timers.enable({apis:['Date'],now});
 assert.equal(parsed(JSON.stringify({...value,issuedAt:now-30000})).complete,true);
 assert.equal(parsed(JSON.stringify({...value,issuedAt:now+5000})).complete,true);
 reject({...value,issuedAt:now-30001});reject({...value,issuedAt:now+5001});
 reject({...value,entityId:randomUUID()});reject({...value,providers:[...value.providers,...value.providers]});
 reject({...value,complete:false});reject({...value,providers:[[value.providers[0][0],value.providers[0][1],'bad',value.providers[0][3],value.providers[0][4]]]});
 reject({...value,providers:[value.providers[0].slice(0,4)]});reject({...value,providers:[value.providers[0],[...value.providers[0].slice(0,4),'c'.repeat(64)]]});
 assert.throws(()=>parsed(' '.repeat(4097)),/context unavailable/);
 assert.throws(()=>installedCapabilityContext({...runtime,entityId:undefined},JSON.stringify(value)),/context unavailable/);
});

test('public headers cannot forge current installed-provider facts even with mixed case',async()=>{
 assert.deepEqual(publicContextHeaders({'X-Steward-Installed-Providers':await raw([row]),'x-steward-actor':'actor'}),{'x-steward-actor':'actor'});
 assert.deepEqual(installedCapabilityContext(runtime,undefined),{});
});
