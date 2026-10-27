import type {ModulePackageManifest} from '@steward/module-sdk';
import {costEvidenceCapability} from '@steward/catalog-kit/cost-evidence';
import {externalCatalogCapability} from '@steward/catalog-kit/external-catalog';
/** Pure package contributions preserve the existing connector interface and operational boundaries. */
export function printifyManifest(base:ModulePackageManifest,migrations:ModulePackageManifest['persistence']['migrations']):ModulePackageManifest{
 if(base.moduleId!=='cee.printify')throw Error('Unexpected module identity');
 const manifest=structuredClone(base);manifest.version='1.3.0';manifest.minimumPlatformVersion='0.15.0';
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
 (manifest.configurationSchema.properties as Record<string,unknown>).costReadEnabled={type:'boolean',default:true,description:'Permit governed reads of cached production cost estimates. This does not authorize orders, fulfillment or production.'};
 (manifest.configurationSchema.properties as Record<string,unknown>).costObservationMaxAgeSeconds={type:'integer',minimum:10,maximum:86400,default:3600,description:'Maximum age of independently successful cost observations with explicitly confirmed currency. Missing costs and unconfirmed currency remain unknown.'};
 const costCapability=costEvidenceCapability('printify',manifest.moduleId);
 manifest.smart!.provides=[...manifest.smart!.provides.filter(c=>c.capabilityId!==costCapability.capabilityId),costCapability];
 manifest.api=[...manifest.api.filter(a=>a.operationId!=='costEvidence'),{operationId:'costEvidence',method:'GET',path:'/cost-evidence',permission:manifest.moduleId+'.cost.read',query:['limit','offset','q']}];
 manifest.ui=[...manifest.ui.filter(screen=>screen.screenId!=='cost-evidence'),{screenId:'cost-evidence',title:'Estimated Cost Evidence',navigationLabel:'Estimated Cost Evidence',navigationGroup:'Production & Fulfillment',workspace:'business',formVersion:1,listOperation:'costEvidence',fields:[
  {name:'name',label:'Source cost reference',type:'string',required:false,readOnly:true},{name:'category',label:'Variable cost category',type:'string',required:false,readOnly:true},{name:'sourceMode',label:'Recorded source read mode',type:'string',required:false,readOnly:true},
  {name:'amount',label:'Source amount (unknown stays unknown)',type:'string',required:false,readOnly:true},{name:'basis',label:'Estimate or recorded source basis',type:'string',required:false,readOnly:true},
  {name:'chargeBasis',label:'Explicit charge basis',type:'string',required:false,readOnly:true},{name:'unitOfMeasure',label:'Explicit source quantity unit',type:'string',required:false,readOnly:true},
  {name:'minimumQuantity',label:'Minimum source quantity',type:'number',required:false,readOnly:true},{name:'expiresAt',label:'Evidence valid until',type:'string',required:false,readOnly:true},
  {name:'reason',label:'Missing evidence or limitations',type:'string',required:false,readOnly:true},{name:'source',label:'Original provider and source evidence',type:'string',required:false,readOnly:true},{name:'origin',label:'Original source origin and provenance',type:'string',required:false,readOnly:true}
 ],columns:['name','category','sourceMode','amount','basis','chargeBasis','unitOfMeasure','minimumQuantity','expiresAt','reason','source','origin']}];
 return manifest;
}
