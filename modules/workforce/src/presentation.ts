import type {ModulePackageManifest} from '@steward/module-sdk';
import {moduleServicesCapability} from '@steward/catalog-kit/module-services';
/** Adds signed interface descriptors only; programme APIs, data and authorization remain unchanged. */
export function workforceManifest(base:ModulePackageManifest,migrations:ModulePackageManifest['persistence']['migrations']):ModulePackageManifest{
 if(base.moduleId!=='cee.workforce')throw Error('Unexpected module identity');
 const manifest=structuredClone(base);manifest.version='1.3.0';manifest.minimumPlatformVersion='0.15.0';
 manifest.persistence={...manifest.persistence,schemaVersion:migrations.length,migrations};
 manifest.smart??={version:1,provides:[],consumes:[],prerequisites:{configuration:{},requiresActive:true,requiresHealthy:true}};
 const capability=moduleServicesCapability(manifest.moduleId);
 manifest.smart.provides=[...manifest.smart.provides.filter(c=>c.capabilityId!==capability.capabilityId),capability];
 return manifest;
}
