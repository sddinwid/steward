import {ensure,get,save,records,publicRecord,object,text,choice,type Context,type Resource,type Action,type RecordValue,type Data,type AccessAuditEvent} from '@steward/business-kit';
import {validateCapabilityValue,type IntegrationCommand} from '@steward/module-sdk';
import type pg from 'pg';
import {authorityUuid,propertyAuthorityCatalogInput,propertyAuthorityVerifyInput} from './authority-contract.js';

const uuid=new RegExp(authorityUuid.pattern);
const permission='cee.assets.authority.';
const denied='Property management authority unavailable';
function enabled(ctx:Context){ensure(ctx.config.syntheticServiceAuthority===true&&typeof ctx.config.serviceAuthorityProgramId==='string'&&uuid.test(ctx.config.serviceAuthorityProgramId)&&typeof ctx.entityId==='string'&&uuid.test(ctx.entityId),denied,403);}
function managerAllowed(ctx:Context,id:string){return Array.isArray(ctx.config.authorizedManagerEntityIds)&&ctx.config.authorizedManagerEntityIds.includes(id);}
function ownerAllowed(ctx:Context,id:string){return Array.isArray(ctx.config.authorizedOwnerEntityIds)&&ctx.config.authorizedOwnerEntityIds.includes(id);}
async function asset(ctx:Context,id:string):Promise<RecordValue>{const row=(await ctx.db.query("SELECT id,kind,key,data,revision FROM business_records WHERE kind='asset' AND id=$1 FOR UPDATE",[id])).rows[0];ensure(row&&row.data.classification==='residential'&&ownerAllowed(ctx,row.data.ownerEntityId),denied,403);return row;}
function interval(data:Data){const start=Date.parse(data.startsAt),end=Date.parse(data.endsAt);ensure(Number.isFinite(start)&&Number.isFinite(end)&&start<end,'A valid management authority interval is required');return{startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString()};}
function humanReviewer(ctx:Context){ensure(uuid.test(ctx.actor)&&ctx.permissions.includes(permission+'review'),'Management authority review permission required',403);}
export async function propertyProgramAuthority(ctx:Context,query:Record<string,string>={}){enabled(ctx);humanReviewer(ctx);ensure(typeof query.q==='string'&&query.q===ctx.config.serviceAuthorityProgramId,denied,403);return{programId:query.q,actorId:ctx.actor,authorized:true,synthetic:true};}
export const managementAuthorityResource:Resource={kind:'management-authority',path:'/management-authorities',key:'number',schema:object({number:text(80),assetId:authorityUuid,managedEntityId:authorityUuid,managedProgramId:authorityUuid,startsAt:text(40),endsAt:text(40),accessBasis:choice(['owned','leased','shared','custody']),authorityReference:text(80)}),prepare:async(b,p,ctx)=>{
 enabled(ctx);ensure(!p||p.data.status==='draft','Reviewed management authority is immutable; withdraw it and request a new review',409);ensure(managerAllowed(ctx,b.managedEntityId),'Manager organization must be explicitly approved in module configuration',403);const a=await asset(ctx,b.assetId);
 ensure(b.accessBasis!=='owned'||b.managedEntityId===a.data.ownerEntityId,'Ownership-based management must match the legal owner');
 return{...b,...interval(b),ownerEntityAtReview:a.data.ownerEntityId,status:'draft',synthetic:true,createdBy:p?.data.createdBy??ctx.actor,reviewedBy:null,reviewedAt:null};
}};
export const managementAuthorityActions:Action[]=[
 {path:'/approve-management/:id',kind:'management-authority',permission:permission+'review',run:async(r,ctx)=>{
  enabled(ctx);humanReviewer(ctx);ensure(r.data.status==='draft','Management authority must be an unreviewed draft',409);ensure(Date.parse(r.data.endsAt)>Date.now(),'Management authority has expired',409);ensure(managerAllowed(ctx,r.data.managedEntityId),denied,403);const a=await asset(ctx,r.data.assetId);ensure(a.data.ownerEntityId===r.data.ownerEntityAtReview,'Asset ownership changed; revise and review the authority again',409);
  // A single canonical asset has one active housing management authority over a
  // time interval. Partition canonical assets explicitly for separate managers.
  const overlap=(await records(ctx,'management-authority')).some(other=>other.id!==r.id&&other.data.status==='approved'&&other.data.assetId===r.data.assetId&&Date.parse(other.data.startsAt)<Date.parse(r.data.endsAt)&&Date.parse(other.data.endsAt)>Date.parse(r.data.startsAt));
  ensure(!overlap,'Management authority overlaps an existing reviewed authority',409);
  return{record:publicRecord(await save(ctx,r.kind,r.key,{...r.data,status:'approved',reviewedBy:ctx.actor,reviewedAt:new Date().toISOString(),assetRevisionAtReview:a.revision},r))};
 }},
 {path:'/withdraw-management/:id',kind:'management-authority',permission:permission+'review',run:async(r,ctx)=>{humanReviewer(ctx);ensure(['draft','approved'].includes(r.data.status),'Management authority is already withdrawn',409);return{record:publicRecord(await save(ctx,r.kind,r.key,{...r.data,status:'withdrawn',withdrawnBy:ctx.actor,withdrawnAt:new Date().toISOString()},r))};}}
];
function peer(ctx:Context,c:IntegrationCommand){enabled(ctx);const p=ctx.peerScope,b=c.payload;ensure(ctx.config.integrationsEnabled===true&&p&&p.expiresAt>Date.now()&&p.destinationEntityId===ctx.entityId&&p.destinationInstallationId===ctx.installationId&&p.destinationProgramId===ctx.config.serviceAuthorityProgramId&&p.sourceProgramId===b.sourceProgramId&&p.destinationProgramId===b.programId&&p.consumerModuleId===c.sourceModuleId,denied,403);return p!;}
function approved(r:RecordValue,a:RecordValue,ctx:Context,sourceEntityId:string,sourceProgramId:string,now:number){return r.data.status==='approved'&&r.data.synthetic===true&&uuid.test(r.data.reviewedBy??'')&&r.data.assetId===a.id&&r.data.managedEntityId===sourceEntityId&&r.data.managedProgramId===sourceProgramId&&managerAllowed(ctx,sourceEntityId)&&ownerAllowed(ctx,a.data.ownerEntityId)&&a.data.ownerEntityId===r.data.ownerEntityAtReview&&Date.parse(r.data.startsAt)<=now&&Date.parse(r.data.endsAt)>now;}
async function observation(ctx:Context,a:RecordValue,now:number){const maintenance=(await records(ctx,'maintenance')).filter(r=>r.data.assetCode===a.key&&r.data.status==='planned'),bookings=(await records(ctx,'booking')).filter(r=>r.data.assetCode===a.key&&r.data.status==='booked'),active=(r:RecordValue)=>Date.parse(r.data.startsAt)<=now&&Date.parse(r.data.endsAt)>now;
 const restricted=maintenance.some(active)||bookings.some(r=>active(r)&&r.data.capacityM3>0);const changes=[...maintenance,...bookings].flatMap(r=>[Date.parse(r.data.startsAt),Date.parse(r.data.endsAt)]).filter(t=>Number.isFinite(t)&&t>now);
 return{available:a.data.availability==='available'&&!restricted,nextBoundary:Math.min(now+60000,...changes)};
}
export async function receivePropertyAuthority(command:IntegrationCommand,ctx:Context):Promise<Data>{
 ensure(['property.authority.catalog','property.authority.verify'].includes(command.command),'Unsupported property authority operation',403);
 try{validateCapabilityValue(command.payload,command.command.endsWith('.verify')?propertyAuthorityVerifyInput:propertyAuthorityCatalogInput);}catch{ensure(false,denied,403);}
 const scope=peer(ctx,command),now=Date.now(),grants=await records(ctx,'management-authority');
 if(command.command==='property.authority.catalog'){
  const candidates=[];for(const a of await records(ctx,'asset')){if(a.data.classification!=='residential')continue;const g=grants.filter(g=>approved(g,a,ctx,scope.sourceEntityId,scope.sourceProgramId,now));if(g.length!==1)continue;const o=await observation(ctx,a,now);candidates.push({assetId:a.id,name:a.data.name,site:a.data.site,ownerEntityId:a.data.ownerEntityId,classification:'residential',assetRevision:a.revision,available:o.available});}
  const offset=Number(command.payload.offset??0);return{records:candidates.slice(offset,offset+20),nextOffset:candidates.length>offset+20?offset+20:null,synthetic:true};
 }
 const a=await asset(ctx,String(command.payload.assetId)),matches=grants.filter(g=>approved(g,a,ctx,scope.sourceEntityId,scope.sourceProgramId,now));ensure(matches.length===1,denied,403);const g=matches[0]!,o=await observation(ctx,a,now);ensure(o.available,'Property is unavailable for a new housing placement',409);
 return{authorized:true,assetId:a.id,assetRevision:a.revision,ownerEntityId:a.data.ownerEntityId,custodianEntityId:a.data.custodianEntityId,userEntityId:a.data.userEntityId,managerEntityId:scope.sourceEntityId,managerProgramId:scope.sourceProgramId,managementAuthorityId:g.id,managementAccessBasis:g.data.accessBasis,classification:'residential',available:true,validUntil:new Date(Math.min(o.nextBoundary,Date.parse(g.data.endsAt),scope.expiresAt)).toISOString(),synthetic:true};
}
export async function auditAssetAccess(event:AccessAuditEvent,db:pg.PoolClient){await db.query('INSERT INTO asset_authority_access_audit(actor,operation_id,record_id,status_code,allowed) VALUES($1,$2,$3,$4,$5)',[event.actor,event.operationId,event.recordId??null,event.statusCode,event.allowed]);}
