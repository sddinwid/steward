import {ensure,get,find,save,type Context,type Data,type Definition,type RecordValue} from '@steward/business-kit';
import {validateCapabilityValue} from '@steward/module-sdk';

/** Automation asks Sales to continue its own accepted order. Inventory commands
 * remain Sales-owned and reuse the existing provider-pinned routing function. */
export function attachSalesWorkflow(definition:Definition,stock:(c:Context,r:RecordValue,command:string,payload:Data)=>Promise<unknown>):Definition{
 const receive=definition.receive!;
 definition.receive=async(command,ctx)=>{
  if(!command.command.startsWith('sales.workflow.'))return receive(command,ctx);
  ensure(ctx.config.workflowEnabled===true,'SALES_WORKFLOW_DISABLED',403);
  const capability=definition.manifest.smart?.provides.find(c=>c.capabilityId==='sales.orders.workflow'),operation=capability?.operations.find(o=>o.command===command.command);
  ensure(operation&&command.capability?.capabilityId===capability?.capabilityId,'SALES_WORKFLOW_CONTRACT_REQUIRED',403);
  validateCapabilityValue(command.payload,operation!.input);
  const source=ctx.incomingProviderIdentity;
  ensure(source&&source.entityId===ctx.entityId&&source.workerInstallationId===ctx.installationId&&source.moduleId===command.sourceModuleId,'SALES_WORKFLOW_SOURCE_REQUIRED',403);
  const b=command.payload as Data,order=await get(ctx,'order',b.orderId);
  // External channel production has its own human approval and reconciliation.
  // These local stock continuations never submit or fulfill commercial orders.
  ensure(!order.data.channel&&!order.data.productionRequested,'SALES_WORKFLOW_LOCAL_ORDER_REQUIRED',409);
  const snapshot=(r:RecordValue)=>({orderId:r.id,revision:r.revision,status:r.data.status,stockStatus:r.data.stockStatus,inventoryIntegrated:r.data.inventoryIntegration===true});
  if(command.command==='sales.workflow.inspect')return snapshot(order);
  ensure(order.revision===b.expectedRevision,'SALES_WORKFLOW_REVISION_CHANGED',409);
  ensure(order.data.inventoryIntegration===true&&order.data.smartInventory===true,'SALES_WORKFLOW_GOVERNED_STOCK_REQUIRED',409);
  ensure(['confirmed','partially_fulfilled'].includes(order.data.status),'SALES_WORKFLOW_ACCEPTED_ORDER_REQUIRED',409);
  if(command.command==='sales.workflow.reserve'){
   ensure(['awaiting_workflow','pending','reserved'].includes(order.data.stockStatus),'SALES_WORKFLOW_RESERVATION_RECONCILIATION_REQUIRED',409);
   if(order.data.stockStatus!=='awaiting_workflow')return snapshot(order);
   await stock(ctx,order,'stock.reserve',{orderId:order.id,lines:order.data.lines.map((l:Data)=>({sku:l.sku,quantity:l.quantity}))});
   return snapshot(await save(ctx,'order',order.key,{...order.data,stockStatus:'pending'},order));
  }
  ensure(command.command==='sales.workflow.fulfill','SALES_WORKFLOW_OPERATION_UNSUPPORTED',403);
  ensure(order.data.stockStatus==='reserved','SALES_WORKFLOW_RESERVATION_NOT_READY',409);
  const resource=definition.resources.find(r=>r.kind==='fulfillment')!,number='WF-'+order.id;
  ensure(!await find(ctx,'fulfillment',number),'SALES_WORKFLOW_FULFILLMENT_ALREADY_REQUESTED',409);
  const lines=order.data.lines.map((l:Data)=>({sku:l.sku,quantity:l.quantity-(order.data.fulfilled[l.sku]??0)})).filter((l:Data)=>l.quantity>0);
  ensure(lines.length>0,'SALES_WORKFLOW_NOTHING_OUTSTANDING',409);
  const input={number,orderNumber:order.key,lines},prepared=await resource.prepare!(input,null,ctx),fulfillment=await save(ctx,'fulfillment',number,prepared);
  await resource.after!(fulfillment,null,ctx);
  await ctx.db.query('INSERT INTO business_audit(actor,operation,record_id) VALUES($1,$2,$3)',[ctx.actor,'workflow.fulfillment.requested',fulfillment.id]);
  return snapshot(await get(ctx,'order',order.id));
 };
 return definition;
}
