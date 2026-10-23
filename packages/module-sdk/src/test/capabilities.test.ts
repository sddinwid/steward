import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolveCapability, validateManifest, validateCapabilityValue, signPackage, verifyPackage, type CapabilityContract, type CapabilityRequirement, type CapabilityProvider, type ModulePackageManifest } from '../index.js';
const input={type:'object',additionalProperties:false,required:['sku'],properties:{sku:{type:'string',maxLength:80}}};
const output={type:'object',additionalProperties:false,required:['available'],properties:{available:{type:'integer',minimum:0}}};
const c:CapabilityContract={capabilityId:'inventory.availability.read',contract:'steward.inventory-availability',version:'1.0.0',operations:[{name:'read',command:'availability',input,output,permission:'example.stock.read',mode:'sync',idempotency:'required',retry:'safe'}],events:[],sensitivity:'business',scope:'entity',ownership:'provider'};
const requirement:CapabilityRequirement={capabilityId:c.capabilityId,contract:c.contract,minimumVersion:'1.0.0',maximumMajor:1,operations:[{name:'read',input,output}],events:[],maximumSensitivity:'business',optional:false};
const entityId=randomUUID(),installationId=randomUUID();
const provider:CapabilityProvider={moduleId:'example.stock',moduleVersion:'1.0.0',installationId,entityId,packageDigest:'a'.repeat(64),state:'active',configured:true,capability:c};
const context={entityId,permissions:['example.stock.read','other.stock.read']};
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
  const m:ModulePackageManifest={...base,minimumPlatformVersion:'0.8.0',smart:{version:1,provides:[],consumes:[requirement],prerequisites:{configuration:{integrationsEnabled:true},requiresActive:true,requiresHealthy:true}}};
  validateManifest(m);
  assert.throws(()=>validateManifest({...m,smart:{...m.smart!,consumes:[{...requirement,operations:[{name:'read',input:{$ref:'https://invalid.example/schema'},output}]}]}}));
  const pair=generateKeyPairSync('ed25519'),secret=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString(),publicKey=pair.publicKey.export({type:'spki',format:'pem'}).toString();
  const p=signPackage({formatVersion:1,publisherId:'test',imageId:'sha256:'+'a'.repeat(64),manifest:m},secret),trust={publishers:[{publisherId:'test',publicKey}]};
  verifyPackage(p,trust);p.payload.manifest.smart!.consumes[0]!.maximumSensitivity='restricted';assert.throws(()=>verifyPackage(p,trust));
});
test('capability values validate closed signed schemas and reject extra or invalid fields',()=>{
  validateCapabilityValue({sku:'SYN-1'},input);assert.throws(()=>validateCapabilityValue({sku:'SYN-1',secret:'x'},input));assert.throws(()=>validateCapabilityValue({available:-1},output));
});
