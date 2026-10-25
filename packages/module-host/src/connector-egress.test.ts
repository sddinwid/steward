import {test} from 'node:test';import assert from 'node:assert/strict';import {connectorNetworkName,plannedConnectorEgress,validateEgressNetwork} from './connector-egress.js';import type {SignedModulePackage} from '@steward/module-sdk';
const owner={project:'steward-selected',workerKey:'worker-3',installationId:'installation'},descriptor={payload:{imageId:'sha256:verified',manifest:{moduleId:'cee.shopify',connector:{provider:'shopify'}}}} as unknown as SignedModulePackage;
test('connector egress is denied by default and simulator modules retain existing isolation',()=>{assert.equal(plannedConnectorEgress(owner,descriptor,{mode:'simulator'}),undefined);assert.throws(()=>plannedConnectorEgress(owner,descriptor,{mode:'live'}),/GRANT_REQUIRED/);const ordinary={payload:{...descriptor.payload,manifest:{moduleId:'unrelated'}}} as unknown as SignedModulePackage;assert.equal(plannedConnectorEgress(owner,ordinary,{mode:'live'}),undefined);});
test('live network grant is bound to original installation, module, namespace and exact verified package image',()=>{const network=connectorNetworkName(owner,'cee.shopify'),grant={'cee.shopify':{network,imageId:descriptor.payload.imageId}};assert.equal(plannedConnectorEgress(owner,descriptor,{mode:'live'},grant),network);assert.throws(()=>plannedConnectorEgress(owner,descriptor,{mode:'live'},{'cee.shopify':{network,imageId:'other'}}),/MISMATCH/);assert.throws(()=>plannedConnectorEgress({...owner,workerKey:'worker-1'},descriptor,{mode:'live'},grant),/MISMATCH/);const actual={Name:network,Internal:false,Driver:'bridge',Labels:{'steward.egress.installation':owner.installationId,'steward.egress.module':'cee.shopify'}};validateEgressNetwork(owner,'cee.shopify',actual);for(const changed of [{Internal:true},{Driver:'host'},{Labels:{'steward.egress.installation':'other'}},{Name:'foreign-network'}])assert.throws(()=>validateEgressNetwork(owner,'cee.shopify',{...actual,...changed}),/UNTRUSTED/);});

import {requireConnectorConfiguration} from './connector-egress.js';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
test('live private configuration preflight fails closed without leaking file contents',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'steward-connector-')),file=path.join(dir,'private.json');try{
 await assert.rejects(requireConnectorConfiguration(),/CONNECTOR_PRIVATE_CONFIGURATION_REQUIRED/);
 await assert.rejects(requireConnectorConfiguration(file),/CONNECTOR_PRIVATE_CONFIGURATION_REQUIRED/);
 for(const value of ['invalid-private-content','null','[]']){await writeFile(file,value);await assert.rejects(requireConnectorConfiguration(file),e=>e instanceof Error&&e.message==='CONNECTOR_PRIVATE_CONFIGURATION_INVALID');}
 await writeFile(file,'{}');await requireConnectorConfiguration(file); // module owns authentication/schema checks
 }finally{await rm(dir,{recursive:true,force:true});}
});
