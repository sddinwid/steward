import {ensure,find,get,save,type Context,type Data,type Definition} from '@steward/business-kit';
import {canonical,validateCapabilityValue,type IntegrationCommand} from '@steward/module-sdk';
const capabilityId='procurement.workflow.requests';
function authority(ctx:Context,c:IntegrationCommand){const own=ctx.providerIdentity,source=ctx.incomingProviderIdentity;ensure(ctx.config.workflowEnabled===true&&!ctx.peerScope&&own&&source&&own.moduleId==='cee.procurement'&&own.workerInstallationId===ctx.installationId&&own.entityId===ctx.entityId&&source.workerInstallationId===ctx.installationId&&source.entityId===ctx.entityId&&source.moduleId===c.sourceModuleId&&c.capability?.capabilityId===capabilityId,'PROCUREMENT_WORKFLOW_AUTHORITY_REQUIRED',403);return source;}
/** Workflow services only create drafts. Existing human Procurement transitions
 * remain the sole authority to approve or place a purchasing proposal. */
export function withProcurementWorkflow(definition:Definition):Definition{
 const ordinary=definition.receive!;
 definition.receive=async(c,ctx)=>{
  if(!c.command.startsWith('procurement.workflow.'))return ordinary(c,ctx);
  const source=authority(ctx,c),op=definition.manifest.smart?.provides.find(p=>p.capabilityId===capabilityId)?.operations.find(o=>o.command===c.command);
  ensure(op,'PROCUREMENT_WORKFLOW_OPERATION_UNSUPPORTED',403);validateCapabilityValue(c.payload,op!.input);const b=c.payload as Data,key=b.requestId.toLowerCase();
  await ctx.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1616))',[key]);
  let intent=await find(ctx,'workflow-procurement-intent',key);
  if(intent)ensure(canonical(intent.data.source)===canonical(source)&&intent.data.entityId===ctx.entityId,'PROCUREMENT_WORKFLOW_ORIGINAL_SOURCE_REQUIRED',403);
  const status=async()=>{ensure(intent,'PROCUREMENT_WORKFLOW_REQUEST_NOT_FOUND',404);const record=await get(ctx,intent!.data.kind,intent!.data.recordId),state=record.data.status;return{requestId:key,recordId:record.id,kind:record.kind,revision:record.revision,status:state,approvalRequired:['draft','submitted'].includes(state),financialCommitment:record.kind==='order'&&['approved','ordered','partially_received','received'].includes(state)};};
  if(c.command==='procurement.workflow.status')return status();
  const fingerprint=canonical({operation:c.command,input:b});
  if(intent){ensure(intent.data.fingerprint===fingerprint,'PROCUREMENT_WORKFLOW_REQUEST_CONFLICT',409);return status();}
  let kind:string,data:Data;const number='WF-'+key;
  if(c.command==='procurement.workflow.replenish'){
   kind='requisition';data={number,supplierCode:'',sku:b.sku,quantity:b.quantity,reason:b.reason,currency:ctx.config.currency,unitPriceCents:0,shippingCents:0,transitionCents:0,status:'draft',sourceEvent:c.commandId,sourceInventoryItemId:null};
  }else{
   ensure(c.command==='procurement.workflow.propose','PROCUREMENT_WORKFLOW_OPERATION_UNSUPPORTED',403);kind='order';
   const resource=definition.resources.find(r=>r.kind==='order')!;const input={number,supplierCode:b.supplierCode,currency:b.currency,lines:b.lines,shippingCents:b.shippingCents};validateCapabilityValue(input,resource.schema);data=await resource.prepare!(input,null,ctx);
  }
  ensure(!await find(ctx,kind,number),'PROCUREMENT_WORKFLOW_RECORD_CONFLICT',409);
  const record=await save(ctx,kind,number,data);intent=await save(ctx,'workflow-procurement-intent',key,{entityId:ctx.entityId,source,fingerprint,kind,recordId:record.id});
  await ctx.db.query('INSERT INTO business_audit(actor,operation,record_id) VALUES($1,$2,$3)',[ctx.actor,c.command,record.id]);
  return status();
 };
 return definition;
}
