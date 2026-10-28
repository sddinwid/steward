import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { capabilityConfigured,capabilityInboundEnabled,capabilityOutboundEnabled,consumerCapabilityConfigured,resolveCapability, validateManifest, validateCapabilityValue, signPackage, verifyPackage, type CapabilityContract, type CapabilityRequirement, type CapabilityProvider, type ModulePackageManifest } from '../index.js';
const input={type:'object',additionalProperties:false,required:['sku'],properties:{sku:{type:'string',maxLength:80}}};
const output={type:'object',additionalProperties:false,required:['available'],properties:{available:{type:'integer',minimum:0}}};
const c:CapabilityContract={capabilityId:'inventory.availability.read',contract:'steward.inventory-availability',version:'1.0.0',operations:[{name:'read',command:'availability',input,output,permission:'example.stock.read',mode:'sync',idempotency:'required',retry:'safe'}],events:[],sensitivity:'business',scope:'entity',ownership:'provider'};
const requirement:CapabilityRequirement={capabilityId:c.capabilityId,contract:c.contract,minimumVersion:'1.0.0',maximumMajor:1,operations:[{name:'read',input,output}],events:[],maximumSensitivity:'business',optional:false};
const entityId=randomUUID(),installationId=randomUUID();
const provider:CapabilityProvider={moduleId:'example.stock',moduleVersion:'1.0.0',installationId,entityId,packageDigest:'a'.repeat(64),state:'active',configured:true,capability:c};
const context={entityId,permissions:['example.stock.read','other.stock.read']};
test('local event capture requires a signed declared stream and versioned provider metadata',()=>{
 const base=JSON.parse(readFileSync(new URL('../../../../modules/inventory/manifest.json',import.meta.url),'utf8')) as ModulePackageManifest;
 const projection=base.replication!.streams[0]!,stream=projection.streamId,provided=base.smart!.provides[0]!;
 const eventSchema={type:'object',additionalProperties:false,required:projection.columns,properties:Object.fromEntries(projection.columns.map(k=>[k,{type:['revision','quantity','reserved_quantity','min_stock'].includes(k)?'integer':'string'}]))};
 const current={...base,minimumPlatformVersion:'0.16.0',smart:{...base.smart!,provides:[{...provided,events:[{name:'stock.changed',streamId:stream,schema:eventSchema}]}]}};
 validateManifest(current);
 for(const schema of [input,{...eventSchema,required:[]},{...eventSchema,properties:{...eventSchema.properties,[projection.revisionColumn]:{type:'string'}}}])assert.throws(()=>validateManifest({...current,smart:{...current.smart,provides:[{...current.smart.provides[0]!,events:[{name:'stock.changed',streamId:stream,schema}]}]}}));
 assert.throws(()=>validateManifest({...current,minimumPlatformVersion:'0.15.0'}));
 assert.throws(()=>validateManifest({...current,smart:{...current.smart,provides:[{...current.smart.provides[0]!,events:[{name:'stock.changed',streamId:'undeclared_private_stream',schema:input}]}]}}));
 assert.throws(()=>validateManifest({...current,smart:{...current.smart,consumes:[{...requirement,events:[{name:'stock.changed',schema:input,streamId:stream}]}]}} as unknown as ModulePackageManifest));
});
test('signed independent consumer gates are versioned, configured and cannot widen legacy disable controls',()=>{
 const base=JSON.parse(readFileSync(new URL('../../../../modules/sales/manifest.json',import.meta.url),'utf8')) as ModulePackageManifest;
 const r={...requirement,configuration:{governedSalesEnabled:true}},m={...base,smart:{...base.smart!,consumes:[r]}};validateManifest(m);
 assert.equal(consumerCapabilityConfigured(m,{governedSalesEnabled:false,integrationsEnabled:true},r),false);
 assert.equal(capabilityOutboundEnabled(m,{governedSalesEnabled:true,integrationsEnabled:false},r.capabilityId),true);
 assert.equal(capabilityOutboundEnabled(m,{governedSalesEnabled:false,integrationsEnabled:true},r.capabilityId),false);
 const legacy={...m,smart:{...m.smart,consumes:[requirement]}};assert.equal(capabilityOutboundEnabled(legacy,{integrationsEnabled:false},r.capabilityId),false);assert.equal(capabilityOutboundEnabled(legacy,{integrationsEnabled:true},r.capabilityId),true);
 for(const configuration of [{},{missing:true},{governedSalesEnabled:[]},{governedSalesEnabled:Infinity}])assert.throws(()=>validateManifest({...m,smart:{...m.smart,consumes:[{...r,configuration} as CapabilityRequirement]}}));
 assert.throws(()=>validateManifest({...m,minimumPlatformVersion:'0.14.0'}));
});
test('independent read provider gates retain global constraints and explicit empty local resolution semantics',()=>{
 const base=JSON.parse(readFileSync(new URL('../../../../modules/pricing/manifest.json',import.meta.url),'utf8')) as ModulePackageManifest,c=base.smart!.provides[0]!;
 assert.equal(capabilityInboundEnabled(base,{integrationsEnabled:false},c.capabilityId),true);
 const constrained={...base,smart:{...base.smart!,prerequisites:{...base.smart!.prerequisites,configuration:{integrationsEnabled:true}}}};assert.equal(capabilityInboundEnabled(constrained,{integrationsEnabled:false},c.capabilityId),false);
 const legacy={...base,smart:{...base.smart!,provides:[{...c,configuration:undefined}]}} as unknown as ModulePackageManifest;assert.equal(capabilityInboundEnabled(legacy,{integrationsEnabled:false},c.capabilityId),false);
 const explicit={...base,smart:{...base.smart!,provides:[{...c,configuration:{catalogReadEnabled:true}}]}};assert.equal(capabilityInboundEnabled(explicit,{catalogReadEnabled:false,integrationsEnabled:true},c.capabilityId),false);assert.equal(capabilityInboundEnabled(explicit,{catalogReadEnabled:true,integrationsEnabled:false},c.capabilityId),true);
});
test('SSMA deterministic selection requires an explicit preference when providers are ambiguous',()=>{
  const other={...provider,moduleId:'other.stock',capability:{...c,operations:[{...c.operations[0]!,permission:'other.stock.read'}]}};
  assert.equal(resolveCapability(requirement,[other,provider],context).state,'ambiguous');
  assert.deepEqual(resolveCapability(requirement,[other,provider],context),resolveCapability(requirement,[provider,other],context));
  assert.equal(resolveCapability(requirement,[provider,other],{...context,preferredProvider:other.moduleId}).selected?.moduleId,other.moduleId);
  assert.equal(resolveCapability(requirement,[provider],context).selected?.moduleId,provider.moduleId);
});
test('SSMA rejects each independent scope, permission, version, schema, event, configuration and health mismatch',()=>{
  const cases:[CapabilityRequirement,CapabilityProvider,typeof context,string][]=[
    [requirement,{...provider,entityId:randomUUID()},context,'ENTITY_SCOPE_MISMATCH'],
    [requirement,provider,{...context,permissions:[]},'PERMISSION_DENIED:example.stock.read'],
    [requirement,{...provider,state:'inactive'},context,'PROVIDER_INACTIVE'],
    [requirement,{...provider,state:'unavailable'},context,'PROVIDER_UNAVAILABLE'],
    [requirement,{...provider,configured:false},context,'CONFIGURATION_PREREQUISITE'],
    [requirement,{...provider,capability:{...c,version:'2.0.0'}},context,'CONTRACT_VERSION_MISMATCH'],
    [requirement,{...provider,capability:{...c,contract:'foreign.contract'}},context,'CONTRACT_IDENTITY_MISMATCH'],
    [requirement,{...provider,capability:{...c,sensitivity:'restricted'}},context,'SENSITIVITY_EXCEEDED'],
    [{...requirement,operations:[{name:'read',input:{...input,required:[]},output}]},provider,context,'SCHEMA_MISMATCH:read'],
    [{...requirement,events:[{name:'stock.changed',schema:input}]},provider,context,'EVENT_MISMATCH:stock.changed']
  ];
  for(const [r,p,ctx,reason]of cases){const result=resolveCapability(r,[p],ctx);assert.equal(result.selected,null,reason);assert.ok(result.evaluations[0]!.reasons.includes(reason),reason);}
});
test('signed optional SSMA metadata preserves legacy manifests and cannot be tampered or inject schemas',()=>{
  const base=JSON.parse(readFileSync(new URL('../../../../modules/sales/manifest.json',import.meta.url),'utf8')) as ModulePackageManifest;
  base.persistence.migrations=Array.from({length:base.persistence.schemaVersion},(_,i)=>({version:i+1,sha256:'a'.repeat(64)}));
  validateManifest(base);
  // A fixed legacy declaration must not inherit future Sales API counts, typed
  // forms or approval metadata and then pretend those existed in Steward 0.8.
  const m:ModulePackageManifest={manifestVersion:1,sdkVersion:1,moduleId:'example.checkout',version:'1.0.0',name:'Legacy checkout',description:'Fixed legacy compatibility fixture',minimumPlatformVersion:'0.8.0',dependencies:[],requiredPermissions:['storage.own-database'],api:[{operationId:'read',method:'GET',path:'/records',permission:'example.checkout.read'}],ui:[],configurationSchema:{type:'object',additionalProperties:false,properties:{integrationsEnabled:{type:'boolean'}}},persistence:{isolation:'dedicated-database',schemaVersion:1,migrations:[{version:1,sha256:'a'.repeat(64)}],destructiveRollback:false},integrationEvents:[],analyticalCapabilities:[],smart:{version:1,provides:[],consumes:[requirement],prerequisites:{configuration:{integrationsEnabled:true},requiresActive:true,requiresHealthy:true}}};
  validateManifest(m);
  const {smart,...withoutSmart}=m;validateManifest(withoutSmart);
  assert.throws(()=>validateManifest({...m,smart:{...m.smart!,consumes:[{...requirement,operations:[{name:'read',input:{$ref:'https://invalid.example/schema'},output}]}]}}));
  const pair=generateKeyPairSync('ed25519'),secret=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString(),publicKey=pair.publicKey.export({type:'spki',format:'pem'}).toString();
  const p=signPackage({formatVersion:1,publisherId:'test',imageId:'sha256:'+'a'.repeat(64),manifest:m},secret),trust={publishers:[{publisherId:'test',publicKey}]};
  verifyPackage(p,trust);p.payload.manifest.smart!.consumes[0]!.maximumSensitivity='restricted';assert.throws(()=>verifyPackage(p,trust));
});
test('capability values validate closed signed schemas and reject extra or invalid fields',()=>{
  validateCapabilityValue({sku:'SYN-1'},input);assert.throws(()=>validateCapabilityValue({sku:'SYN-1',secret:'x'},input));assert.throws(()=>validateCapabilityValue({available:-1},output));
});


test('signed per-capability prerequisites preserve independent ordinary and simulation configuration',()=>{
 const m=JSON.parse(readFileSync(new URL('../../../../modules/sales/manifest.json',import.meta.url),'utf8')) as ModulePackageManifest;
 validateManifest(m);const ordinary=m.smart!.provides.find(p=>p.capabilityId==='commerce.orders.manage')!,synthetic=m.smart!.provides.find(p=>p.capabilityId==='simulation.sales.manage')!;
 assert.equal(capabilityConfigured(m,{integrationsEnabled:false,simulationEnabled:true},ordinary),false);
 assert.equal(capabilityConfigured(m,{integrationsEnabled:false,simulationEnabled:true},synthetic),true);
 assert.equal(capabilityConfigured(m,{integrationsEnabled:true,simulationEnabled:false},ordinary),true);
 assert.equal(capabilityConfigured(m,{integrationsEnabled:true,simulationEnabled:false},synthetic),false);
 const contradictory={...synthetic,configuration:{integrationsEnabled:false}};const global={...m,smart:{...m.smart!,prerequisites:{...m.smart!.prerequisites,configuration:{integrationsEnabled:true}}}};assert.equal(capabilityConfigured(global,{integrationsEnabled:false},contradictory),false);assert.equal(capabilityConfigured(global,{integrationsEnabled:true},contradictory),false);
 assert.throws(()=>validateManifest({...m,smart:{...m.smart!,provides:[{...synthetic,configuration:{unknown:true}}]}}));
});
