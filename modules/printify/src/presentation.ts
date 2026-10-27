import type {ModulePackageManifest} from '@steward/module-sdk';
import {externalCatalogCapability} from '@steward/catalog-kit/external-catalog';
/** Pure package contributions preserve the existing connector interface and operational boundaries. */
export function printifyManifest(base:ModulePackageManifest,migrations:ModulePackageManifest['persistence']['migrations']):ModulePackageManifest{
 if(base.moduleId!=='cee.printify')throw Error('Unexpected module identity');
 const manifest=structuredClone(base);manifest.version='1.2.0';manifest.minimumPlatformVersion='0.15.0';
 manifest.persistence={...manifest.persistence,schemaVersion:migrations.length,migrations};
 const capability=externalCatalogCapability('printify',manifest.moduleId);capability.configuration={catalogReadEnabled:true};
 manifest.smart??={version:1,provides:[],consumes:[],prerequisites:{configuration:{},requiresActive:true,requiresHealthy:true}};
 // Move the old global conjunction to every legacy edge before opening the independent read edge.
 const legacyPrerequisites=manifest.smart.prerequisites.configuration;
 manifest.smart.provides=[...manifest.smart.provides.filter(c=>c.capabilityId!==capability.capabilityId).map(c=>({...c,configuration:{...c.configuration,...legacyPrerequisites}})),capability];
 manifest.smart.consumes=manifest.smart.consumes.map(c=>({...c,configuration:{...c.configuration,...legacyPrerequisites}}));
 manifest.smart.prerequisites={...manifest.smart.prerequisites,configuration:{}};
 (manifest.configurationSchema.properties as Record<string,unknown>).catalogReadEnabled={type:'boolean',default:true,description:'Permit governed read-only access to successful cached catalog observations. This does not enable order import, fulfillment or production.'};
 (manifest.configurationSchema.properties as Record<string,unknown>).catalogObservationMaxAgeSeconds={type:'integer',minimum:10,maximum:86400,default:3600,description:'Maximum age of a successful cached external catalog observation. A current observation grants no stock, price, fulfillment or production authority.'};
 return manifest;
}
