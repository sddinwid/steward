import {orderProfitability} from '@steward/commerce-kit';
import type {RecordValue} from '@steward/business-kit';
/** No allocation or recognition is inferred from order-level status or supplier retail prices. */
export function monitoringFinancials(order:RecordValue){
 const d=order.data;
 const evidence={moduleId:'cee.shopify',recordKind:'order',recordId:order.id,revision:order.revision,connectionId:d.connectionId,remoteOrderId:d.remoteSourceId,sourceUpdatedAt:d.sourceUpdatedAt??null};
 const unknown={recognizedRevenueCents:null,merchandiseRefundCents:null,productionCostCents:null,shippingCostCents:null,transactionFeeCents:null,channelFeeCents:null,contributionMarginCents:null,taxCents:null,customerShippingCents:null};
 try{
  const calculation=orderProfitability({sourceId:d.sourceId,channel:'shopify',currency:d.currency,orderCreatedAt:d.sourceCreatedAt,fulfilledAt:null,status:d.financialStatus,productionStatus:null,recognizedRevenueCents:0,refundCents:0,productionCostCents:null,shippingCostCents:null,costBasis:'incomplete',products:d.lines.map((l:any)=>({sku:l.remoteLineId??l.sourceVariantId,quantity:l.quantity,unitPriceCents:l.unitPriceCents,lineRevenueCents:l.lineRevenueCents,fulfilledQuantity:0,recognizedRevenueCents:0}))});
  return{currency:d.currency,grossMerchandiseCents:calculation.grossSalesCents,discountCents:calculation.discountCents,bookedMerchandiseCents:calculation.bookedRevenueCents,totalSourceRefundCents:Number.isSafeInteger(d.refundCents)&&d.refundCents>=0?d.refundCents:null,...unknown,evidence,basis:'Booked merchandise only; not recognized revenue or profit. Source refunds may include tax and shipping. Payment, fulfillment, cost currency, fees and allocations are not inferred.',status:'incomplete'};
 }catch{return{currency:d.currency??null,grossMerchandiseCents:null,discountCents:null,bookedMerchandiseCents:null,totalSourceRefundCents:null,...unknown,evidence,basis:'Incomplete or invalid source merchandise evidence; no financial conclusion.',status:'incomplete'};}
}
