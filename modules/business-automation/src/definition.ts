import {withWorkflowNotifications} from './notifications.js';
import {randomUUID} from 'node:crypto';
import {ensure,save,object,text,publicRecord,BusinessError,type Definition,type Context,type RecordValue} from '@steward/business-kit';
import {canonical,digest,inspectWorkflowGraph,validateWorkflowGraph,validateWorkflowInput,workflowFieldsFromSchema,type ModulePackageManifest,type WorkflowGraph,type WorkflowFields} from '@steward/module-sdk';

const uuid={type:'string',pattern:'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'};
const graphSchema=object({graphVersion:{const:1},nodes:{type:'array',minItems:2,maxItems:32,items:{type:'object'}},edges:{type:'array',maxItems:64,items:{type:'object'}},limits:object({elapsedMs:{type:'integer',minimum:1000,maximum:2678400000},maxParallel:{type:'integer',minimum:1,maximum:4},maxActions:{type:'integer',minimum:1,maximum:24}})});
const owner=(ctx:Context)=>{ensure(typeof ctx.entityId==='string','Trusted enrolled entity required',503);return ctx.entityId;};
const human=(ctx:Context)=>ensure(new RegExp(uuid.pattern).test(ctx.actor),'Authenticated local business account required',403);
function owned(ctx:Context,record:RecordValue){ensure(record.data.ownerEntityId===owner(ctx),'Workflow unavailable',404);}
function currentReviewer(ctx:Context,moduleId:string){const p=ctx.approvalPrincipals;ensure(p&&p.reviewerPermission===moduleId+'.approve'&&p.issuedAt<=Date.now()&&p.issuedAt>=Date.now()-5000&&p.actors.includes(ctx.actor),'Current reviewer authority required',403);}
const listScope=(kind:string)=>async(ctx:Context)=>{const rows=(await ctx.db.query("SELECT id FROM business_records WHERE kind=$1 AND data->>'ownerEntityId'=$2 LIMIT 10001",[kind,owner(ctx)])).rows;ensure(rows.length<=10000,'Workflow collection limit reached',409);return{ids:rows.map(r=>r.id)};};
function triggerFor(manifest:ModulePackageManifest,selection:unknown='manual'){
 if(selection==='manual')return{trigger:{kind:'manual' as const,input:object({reference:text(120)})},sensitivity:'business' as const};
 ensure(typeof selection==='string','A declared trigger source is required',422);
 const matches=manifest.smart?.consumes.flatMap(c=>c.events.filter(e=>c.capabilityId+'/'+e.name===selection).map(e=>({requirement:c,event:e})))??[];
 ensure(matches.length===1,'Trigger must select one signed consumer event requirement',422);
 const {requirement,event}=matches[0]!;
 return{trigger:{kind:'event' as const,capabilityId:requirement.capabilityId,eventName:event.name,input:event.schema},sensitivity:requirement.maximumSensitivity};
}
function fieldsFor(manifest:ModulePackageManifest,graph:WorkflowGraph,selection:unknown='manual'):WorkflowFields{
 const selected=triggerFor(manifest,selection);
 const result={...workflowFieldsFromSchema('trigger',selected.trigger.input,{sensitivity:selected.sensitivity,maxAgeMs:manifest.workflowServices?.triggerDiscovery?.maxAgeMs??60000},{omitBoundedCollections:true})};
 for(const node of graph.nodes){if(!['action','notification'].includes(node.kind))continue;
  const matches=manifest.smart?.consumes.flatMap(c=>c.operations.filter(o=>o.name===node.operation).map(operation=>({operation,sensitivity:c.maximumSensitivity})))??[];
  if(matches.length===1)try{Object.assign(result,workflowFieldsFromSchema(node.id,matches[0]!.operation.output,{sensitivity:matches[0]!.sensitivity,maxAgeMs:manifest.workflowServices?.triggerDiscovery?.maxAgeMs??60000},{omitBoundedCollections:true}));}catch{/* Unsupported collection/union output is not exposed as a scalar variable. */}
 }
 return result;
}
function validatePublication(manifest:ModulePackageManifest,ctx:Context,graph:unknown,selection:unknown='manual'){
 const fields=fieldsFor(manifest,graph as WorkflowGraph,selection);validateWorkflowGraph(graph,fields);
 ensure(graph.limits.elapsedMs<=ctx.config.maxElapsedMs&&graph.limits.maxParallel<=ctx.config.maxParallel,'Workflow exceeds the configured execution limits');
 for(const node of graph.nodes){if(node.kind==='approval')ensure(node.approverPermission===manifest.approvalServices?.reviewerPermission,'Approval permission must match the signed module reviewer declaration',422);if(!['action','notification'].includes(node.kind))continue;
  const matches=manifest.smart?.consumes.flatMap(c=>c.operations).filter(o=>o.name===node.operation)??[];
  ensure(matches.length===1,'Action must identify one signed consumer operation');
  validateWorkflowInput({object:node.inputs},matches[0]!.input,fields);
 }
 return fields;
}
export function automation(manifest:ModulePackageManifest):Definition{
 return withWorkflowNotifications({
  manifest,
  authorize:async(ctx,access)=>{human(ctx);owner(ctx);if(access.record)owned(ctx,access.record);if(access.kind==='review'&&['create','update'].includes(access.operation))currentReviewer(ctx,manifest.moduleId);},
  resources:[{
   kind:'workflow',path:'/workflows',key:'recordKey',searchFields:['name','description'],listScope:listScope('workflow'),
   schema:{...object({recordKey:uuid,name:text(120),description:text(2000),graph:graphSchema,triggerSource:text(200)}),required:['recordKey','name','description','graph']},
   prepare:async(data,previous,ctx)=>{
    if(previous)owned(ctx,previous);ensure(Buffer.byteLength(canonical(data.graph))<=65536,'Workflow exceeds the bounded definition size');
    triggerFor(manifest,data.triggerSource??'manual');
    return{...data,triggerSource:data.triggerSource??'manual',ownerEntityId:owner(ctx),authorId:previous?.data.authorId??ctx.actor,editorId:ctx.actor,status:'draft',publicationVersion:previous?.data.publicationVersion??0,
      latestPublicationId:previous?.data.latestPublicationId??null,validation:inspectWorkflowGraph(data.graph,fieldsFor(manifest,data.graph,data.triggerSource??'manual')).slice(0,100)};
   }
  },{
   kind:'review',path:'/reviews',key:'recordKey',listScope:listScope('review'),schema:object({recordKey:uuid,publicationId:uuid,decision:{type:'string',enum:['approve','reject','revoke']},reason:text(2000),validForMinutes:{type:'integer',minimum:1,maximum:44640}}),
   prepare:async(data,previous,ctx)=>{
    ensure(!previous,'Workflow reviews are append-only',409);
    const publication=(await ctx.db.query('SELECT * FROM workflow_publications WHERE id=$1 AND owner_entity_id=$2',[data.publicationId,owner(ctx)])).rows[0];ensure(publication,'Published workflow unavailable',404);
    currentReviewer(ctx,manifest.moduleId);
    ensure(![publication.published_by,publication.author_id,publication.editor_id].includes(ctx.actor),'A different authorized person must review this workflow',403);
    const expiry=(await ctx.db.query("SELECT clock_timestamp()+make_interval(mins=>$1) AS expires_at",[data.validForMinutes])).rows[0].expires_at;
    return{...data,ownerEntityId:owner(ctx),actorId:ctx.actor,expiresAt:expiry.toISOString(),definitionDigest:publication.digest};
   },
   after:async(record,_previous,ctx)=>{await ctx.db.query('INSERT INTO workflow_reviews(id,publication_id,actor_id,decision,reason,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[record.id,record.data.publicationId,ctx.actor,record.data.decision,record.data.reason,record.data.expiresAt]);}
  }],
  actions:[{path:'/publish/:id',permission:manifest.moduleId+'.publish',kind:'workflow',run:async(record,ctx)=>{
   owned(ctx,record);human(ctx);let fields:WorkflowFields;
   try{fields=validatePublication(manifest,ctx,record.data.graph,record.data.triggerSource??'manual');}catch(error){if(error instanceof BusinessError)throw error;throw new BusinessError(422,'Workflow validation failed: '+(error instanceof Error&&error.message.startsWith('WORKFLOW_')?error.message.slice(0,1000):'invalid definition'));}
   const version=Number(record.data.publicationVersion)+1,id=randomUUID();ensure(Number.isSafeInteger(version)&&version<=10000,'Workflow version limit reached');
   const definition={contractVersion:1,workflowId:record.id,version,name:record.data.name,description:record.data.description,graph:record.data.graph,fields,
    trigger:triggerFor(manifest,record.data.triggerSource??'manual').trigger,consumerId:manifest.moduleId};
   const hash=digest(canonical(definition));
   await ctx.db.query('INSERT INTO workflow_publications(id,workflow_id,version,owner_entity_id,definition,digest,published_by,author_id,editor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,record.id,version,owner(ctx),definition,hash,ctx.actor,record.data.authorId,record.data.editorId]);
   const changed=await save(ctx,'workflow',record.key,{...record.data,status:'published-awaiting-review',publicationVersion:version,latestPublicationId:id},record);
   return{record:publicRecord(changed),publicationId:id,definitionDigest:hash,executionActivated:false};
  }}],
  queries:[{path:'/trigger-contracts',run:async(_ctx,query)=>{
   const choices=[{id:'manual',name:'Authorized manual start'},...(manifest.smart?.consumes.flatMap(c=>c.events.map(e=>({id:c.capabilityId+'/'+e.name,name:c.capabilityId+' / '+e.name})))??[])];
   const selected=query?.q?choices.filter(c=>c.id===query.q):choices;
   return{records:selected.map(c=>({...c,...triggerFor(manifest,c.id)})),summary:'Signed trigger requirements only. An event still needs an approved local provider binding and Worker subscription.'};
  }},{path:'/publications',run:async(ctx,query)=>{
   const selected=query?.q,limit=Number(query?.limit??20),offset=Number(query?.offset??0);ensure(Number.isSafeInteger(limit)&&limit>=1&&limit<=20&&Number.isSafeInteger(offset)&&offset>=0&&offset<=10000,'Invalid publication page',400);if(selected)ensure(new RegExp(uuid.pattern).test(selected),'Invalid publication identity',400);
   const rows=(await ctx.db.query('SELECT p.*,r.id review_id,r.created_at reviewed_at,r.decision,r.actor_id reviewer_id,r.expires_at FROM workflow_publications p LEFT JOIN LATERAL(SELECT * FROM workflow_reviews WHERE publication_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1) r ON true WHERE p.owner_entity_id=$1 AND ($2::uuid IS NULL OR p.id=$2) ORDER BY p.published_at DESC,p.id LIMIT $3 OFFSET $4',[owner(ctx),selected??null,selected?1:limit+1,selected?0:offset])).rows;
   return{nextOffset:!selected&&rows.length>limit?offset+limit:null,records:rows.slice(0,limit).map(r=>{let executionAllowed=true;try{validatePublication(manifest,ctx,r.definition.graph,r.definition.trigger.kind==='manual'?'manual':r.definition.trigger.capabilityId+'/'+r.definition.trigger.eventName);ensure(canonical(triggerFor(manifest,r.definition.trigger.kind==='manual'?'manual':r.definition.trigger.capabilityId+'/'+r.definition.trigger.eventName).trigger)===canonical(r.definition.trigger),'Trigger contract changed',409);}catch{executionAllowed=false;}return{id:r.id,executionAllowed,...(executionAllowed?{}:{executionBlock:'CURRENT_CONFIGURATION_OR_CONTRACT_INVALID'}),name:r.definition.name+' · version '+r.version,workflowId:r.workflow_id,version:r.version,...(selected?{definition:r.definition}:{}),definitionDigest:r.digest,ownerEntityId:r.owner_entity_id,publishedBy:r.published_by,authorId:r.author_id,editorId:r.editor_id,publishedAt:r.published_at,review:r.decision?{id:r.review_id,decision:r.decision,reviewerId:r.reviewer_id,reviewedAt:r.reviewed_at,expiresAt:r.expires_at}:null};}),summary:'Immutable published definitions. Review is separate from Worker-governed activation.'};
  }},{path:'/workflow-status',run:async(ctx)=>{
   const rows=(await ctx.db.query("SELECT id,data->>'name' name,data->>'status' status,COALESCE((data->>'publicationVersion')::integer,0) version FROM business_records WHERE kind='workflow' AND data->>'ownerEntityId'=$1 ORDER BY updated_at DESC LIMIT 20",[owner(ctx)])).rows;
   return{records:rows,summary:'Definition status only. Publication does not activate or execute a workflow.'};
  }}]
 });
}
