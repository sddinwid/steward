import type {ModulePackageManifest} from '@steward/module-sdk';
import {costEvidenceCapability} from '@steward/catalog-kit/cost-evidence';
import {supplierReferencesCapability} from '@steward/catalog-kit/operational';
/** Preserve existing signed contributions; add only the new read-only reference interface. */
export function procurementManifest(base:ModulePackageManifest,migrations:ModulePackageManifest['persistence']['migrations']):ModulePackageManifest{
 if(base.moduleId!=='cee.procurement')throw Error('Unexpected module identity');
 const manifest=structuredClone(base);manifest.version='1.3.0';manifest.minimumPlatformVersion='0.15.0';
 manifest.persistence={...manifest.persistence,schemaVersion:migrations.length,migrations};
 manifest.api=[...manifest.api.filter(a=>a.operationId!=='supplierReferences'),{operationId:'supplierReferences',method:'GET',path:'/supplier-references',permission:'cee.procurement.read',query:['limit','offset','q']}];
 manifest.ui=[...manifest.ui.filter(s=>s.screenId!=='reference-directory'),{screenId:'reference-directory',title:'Supplier References',navigationLabel:'Supplier References',navigationGroup:'Procurement',workspace:'business',formVersion:1,listOperation:'supplierReferences',fields:[{name:'name',label:'Source record',type:'string',required:false,readOnly:true},{name:'code',label:'Source code',type:'string',required:false,readOnly:true},{name:'recordRevision',label:'Record revision',type:'number',required:false,readOnly:true},{name:'validUntil',label:'Read evidence valid until',type:'string',required:false,readOnly:true},{name:'proof',label:'Original provider and read evidence',type:'string',required:false,readOnly:true}],columns:['name','code','recordRevision','validUntil','proof']}];
 const properties=manifest.configurationSchema.properties as Record<string,unknown>;
 properties.referenceLeaseSeconds={type:'integer',minimum:10,maximum:3600,default:300,description:'Maximum lease for read-only reference metadata. A lease grants no stock, supplier purchase, or operational authority.'};
 properties.costReadEnabled={type:'boolean',default:true,description:'Permit governed reads of approved supplier quote cost estimates. This grants no purchasing or payment authority.'};
 properties.costObservationMaxAgeSeconds={type:'integer',minimum:10,maximum:86400,default:3600,description:'Maximum age of supplier cost evidence. Source validity may expire earlier; a quote is not an incurred expense.'};
 const quote=manifest.ui.find(s=>s.screenId==='quote');
 if(quote){
  quote.formVersion=1;
  quote.fields=quote.fields.filter(f=>!['unitOfMeasure','shippingChargeBasis'].includes(f.name)).map(f=>f.name==='supplierCode'?{...f,reference:{operationId:'listSupplier',valueField:'code',labelField:'name'}}:f.name==='validUntil'?{...f,format:'date-time' as const}:f);
  quote.fields.push({name:'unitOfMeasure',label:'Explicit quote quantity unit (blank means unknown)',type:'string',required:false,maxLength:40},{name:'shippingChargeBasis',label:'Explicit shipping charge basis (blank means unknown)',type:'string',required:false,enum:['per-order']});
  quote.columns=[...quote.columns.filter(c=>!['unitOfMeasure','shippingChargeBasis'].includes(c)),'unitOfMeasure','shippingChargeBasis'];
 }
 
 const capability=supplierReferencesCapability('cee.procurement');
 manifest.smart??={version:1,provides:[],consumes:[],prerequisites:{configuration:{},requiresActive:true,requiresHealthy:true}};
 manifest.smart.provides=[...manifest.smart.provides.filter(c=>c.capabilityId!==capability.capabilityId),capability];
 const costCapability=costEvidenceCapability('procurement',manifest.moduleId);
 manifest.smart!.provides=[...manifest.smart!.provides.filter(c=>c.capabilityId!==costCapability.capabilityId),costCapability];
 manifest.api=[...manifest.api.filter(a=>a.operationId!=='costEvidence'),{operationId:'costEvidence',method:'GET',path:'/cost-evidence',permission:manifest.moduleId+'.cost.read',query:['limit','offset','q']}];
 manifest.ui=[...manifest.ui.filter(screen=>screen.screenId!=='cost-evidence'),{screenId:'cost-evidence',title:'Estimated Cost Evidence',navigationLabel:'Estimated Cost Evidence',navigationGroup:'Procurement',workspace:'business',formVersion:1,listOperation:'costEvidence',fields:[
  {name:'name',label:'Source cost reference',type:'string',required:false,readOnly:true},{name:'category',label:'Variable cost category',type:'string',required:false,readOnly:true},{name:'sourceMode',label:'Recorded source read mode',type:'string',required:false,readOnly:true},
  {name:'amount',label:'Source amount (unknown stays unknown)',type:'string',required:false,readOnly:true},{name:'basis',label:'Estimate or recorded source basis',type:'string',required:false,readOnly:true},
  {name:'chargeBasis',label:'Explicit charge basis',type:'string',required:false,readOnly:true},{name:'unitOfMeasure',label:'Explicit source quantity unit',type:'string',required:false,readOnly:true},
  {name:'minimumQuantity',label:'Minimum source quantity',type:'number',required:false,readOnly:true},{name:'expiresAt',label:'Evidence valid until',type:'string',required:false,readOnly:true},
  {name:'reason',label:'Missing evidence or limitations',type:'string',required:false,readOnly:true},{name:'source',label:'Original provider and source evidence',type:'string',required:false,readOnly:true},{name:'origin',label:'Original source origin and provenance',type:'string',required:false,readOnly:true}
 ],columns:['name','category','sourceMode','amount','basis','chargeBasis','unitOfMeasure','minimumQuantity','expiresAt','reason','source','origin']}];
 return manifest;
}
