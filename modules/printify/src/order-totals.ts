import {ensure,type Context,type Data} from '@steward/business-kit';
import {validateCapabilityValue,type IntegrationCommand} from '@steward/module-sdk';
import {orderTotalCostCapabilityId,orderTotalCostOperation} from '@steward/commerce-kit';
import {orderConnections} from './order-observations.js';
export async function orderTotalsReceive(command:IntegrationCommand,ctx:Context):Promise<Data|null>{
 if(command.command!==orderTotalCostOperation.name)return null;
 const p=ctx.providerIdentity,c=ctx.incomingProviderIdentity;ensure(ctx.config.costReadEnabled===true&&p&&c&&!ctx.peerScope&&p.moduleId==='cee.printify'&&p.workerInstallationId===ctx.installationId&&p.entityId===ctx.entityId&&c.workerInstallationId===ctx.installationId&&c.entityId===ctx.entityId&&c.moduleId===command.sourceModuleId&&command.capability?.capabilityId===orderTotalCostCapabilityId,'Local governed order cost read unavailable',403);
 validateCapabilityValue(command.payload,orderTotalCostOperation.input);const b=command.payload as Data,connection=(await orderConnections(ctx)).find(c=>c.connectionId===b.connectionId);
 ensure(connection&&connection.accountId===b.accountId&&connection.originDigest===b.originDigest,'Original cost store identity changed',409);
 let items:Data[]=[],nextOffset=null,status=connection.state==='ready'?'ok':connection.state;
 if(status==='ok'){
 const rows=(await ctx.db.query("SELECT b.* FROM business_records b JOIN printify_order_sync s ON s.connection_id=$1 WHERE b.kind='external-order' AND b.data->>'connectionId'=$1 AND b.data->>'shopOrderId'=$2 AND s.order_ids ? (b.data->>'remoteSourceId') ORDER BY b.key LIMIT $3 OFFSET $4",[b.connectionId,b.shopOrderId,b.limit+1,b.offset])).rows;
 nextOffset=rows.length>b.limit?b.offset+b.limit:null;
 items=rows.slice(0,b.limit).map(r=>{const e=r.data.costEvidence??{};return{sourceRecordId:r.id,sourceRevision:Number(r.revision),sourceStreamId:'printify_order_totals_v1',remoteOrderId:r.data.remoteSourceId,shopOrderId:r.data.shopOrderId,status:r.data.status,isReprint:r.data.isReprint??null,observedAt:r.data.itemCostsObservedAt??null,cost:{currency:e.currency??null,currencyBasis:e.currencyBasis??'unknown',productionCostCents:e.productionCostCents??null,shippingCostCents:e.shippingCostCents??null,itemShippingCostCents:e.itemShippingCostCents??null,shippingAdjustmentCents:e.shippingAdjustmentCents??null,shippingBasis:e.shippingBasis??'unknown',basis:e.basis??'incomplete'}};});
 }
 const result={contractVersion:1,connection,status,shopOrderId:b.shopOrderId,items,nextOffset};validateCapabilityValue(result,orderTotalCostOperation.output);return result;
}
