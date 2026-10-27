import type {ModulePackageManifest} from '@steward/module-sdk';
import {inventoryItemsCapability,verifiedStockCapability} from '@steward/catalog-kit/operational';
/** Preserve existing signed contributions; add only the new read-only reference interface. */
export function inventoryManifest(base:ModulePackageManifest,migrations:ModulePackageManifest['persistence']['migrations']):ModulePackageManifest{
 if(base.moduleId!=='cee.inventory')throw Error('Unexpected module identity');
 const manifest=structuredClone(base);manifest.version='1.6.0';manifest.minimumPlatformVersion='0.15.0';
 manifest.persistence={...manifest.persistence,schemaVersion:migrations.length,migrations};
 manifest.api=[...manifest.api.filter(a=>a.operationId!=='itemReferences'),{operationId:'itemReferences',method:'GET',path:'/item-references',permission:'cee.inventory.read',query:['limit','offset','q']}];
 manifest.ui=[...manifest.ui.filter(s=>s.screenId!=='reference-directory'),{screenId:'reference-directory',title:'Inventory Item References',navigationLabel:'Inventory Item References',navigationGroup:'Products & Inventory',workspace:'business',formVersion:1,listOperation:'itemReferences',fields:[{name:'name',label:'Source record',type:'string',required:false,readOnly:true},{name:'code',label:'Source code',type:'string',required:false,readOnly:true},{name:'quantityUnit',label:'Explicit quantity unit',type:'string' as const,required:false,readOnly:true},{name:'recordRevision',label:'Record revision',type:'number',required:false,readOnly:true},{name:'validUntil',label:'Read evidence valid until',type:'string',required:false,readOnly:true},{name:'proof',label:'Original provider and read evidence',type:'string',required:false,readOnly:true}],columns:['name','code','quantityUnit','recordRevision','validUntil','proof']}];
 const properties=manifest.configurationSchema.properties as Record<string,unknown>;
 properties.referenceLeaseSeconds={type:'integer',minimum:10,maximum:3600,default:300,description:'Maximum lease for read-only reference metadata. A lease grants no stock, supplier purchase, or operational authority.'};
 
 const capability=inventoryItemsCapability('cee.inventory');
 manifest.smart??={version:1,provides:[],consumes:[],prerequisites:{configuration:{},requiresActive:true,requiresHealthy:true}};
 const verified=verifiedStockCapability(manifest.moduleId);
 manifest.smart.provides=[...manifest.smart.provides.filter(c=>![capability.capabilityId,verified.capabilityId].includes(c.capabilityId)),capability,verified];
 return manifest;
}
