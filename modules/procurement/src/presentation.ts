import type {ModulePackageManifest} from '@steward/module-sdk';
import {supplierReferencesCapability} from '@steward/catalog-kit/operational';
/** Preserve existing signed contributions; add only the new read-only reference interface. */
export function procurementManifest(base:ModulePackageManifest,migrations:ModulePackageManifest['persistence']['migrations']):ModulePackageManifest{
 if(base.moduleId!=='cee.procurement')throw Error('Unexpected module identity');
 const manifest=structuredClone(base);manifest.version='1.2.0';manifest.minimumPlatformVersion='0.15.0';
 manifest.persistence={...manifest.persistence,schemaVersion:migrations.length,migrations};
 manifest.api=[...manifest.api.filter(a=>a.operationId!=='supplierReferences'),{operationId:'supplierReferences',method:'GET',path:'/supplier-references',permission:'cee.procurement.read',query:['limit','offset','q']}];
 manifest.ui=[...manifest.ui.filter(s=>s.screenId!=='reference-directory'),{screenId:'reference-directory',title:'Supplier References',navigationLabel:'Supplier References',navigationGroup:'Procurement',workspace:'business',formVersion:1,listOperation:'supplierReferences',fields:[{name:'name',label:'Source record',type:'string',required:false,readOnly:true},{name:'code',label:'Source code',type:'string',required:false,readOnly:true},{name:'recordRevision',label:'Record revision',type:'number',required:false,readOnly:true},{name:'validUntil',label:'Read evidence valid until',type:'string',required:false,readOnly:true},{name:'proof',label:'Original provider and read evidence',type:'string',required:false,readOnly:true}],columns:['name','code','recordRevision','validUntil','proof']}];
 const properties=manifest.configurationSchema.properties as Record<string,unknown>;
 properties.referenceLeaseSeconds={type:'integer',minimum:10,maximum:3600,default:300,description:'Maximum lease for read-only reference metadata. A lease grants no stock, supplier purchase, or operational authority.'};
 
 const capability=supplierReferencesCapability('cee.procurement');
 manifest.smart??={version:1,provides:[],consumes:[],prerequisites:{configuration:{},requiresActive:true,requiresHealthy:true}};
 manifest.smart.provides=[...manifest.smart.provides.filter(c=>c.capabilityId!==capability.capabilityId),capability];
 return manifest;
}
