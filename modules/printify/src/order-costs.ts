import {ensure,type Data} from '@steward/business-kit';
import {canonical,digest} from '@steward/module-sdk';
const reference=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9:_./-]{1,120}$/.test(v)?v:typeof v==='number'&&Number.isSafeInteger(v)?String(v):null;
const amount=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
const rawAmount=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?String(v):typeof v==='string'&&v.length<=120&&/^-?[0-9]+(?:\.[0-9]+)?$/.test(v)?v:null;
const timestamp=(v:unknown)=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v))?v:null;
export function orderItemCosts(order:Data,confirmedCurrency:unknown){
 ensure(!Array.isArray(order.line_items)||order.line_items.length<=1000,'Order cost item bound exceeded',413);
 const validCurrency=(v:unknown):v is string=>typeof v==='string'&&/^[A-Z]{3}$/.test(v);
 const conflict=validCurrency(order.currency)&&validCurrency(confirmedCurrency)&&order.currency!==confirmedCurrency;
 const currency=conflict?null:validCurrency(order.currency)?order.currency:order.currency==null&&validCurrency(confirmedCurrency)?confirmedCurrency:null;
 const currencyBasis=conflict?'conflict':currency?(order.currency===currency?'provider':'administrator-confirmed'):'unknown';
 const lines=(Array.isArray(order.line_items)?order.line_items:[]).map((l:Data)=>{
  const providerLineId=reference(l.id),externalLineId=reference(l.metadata?.external_id??l.external_id),productId=reference(l.product_id),variantId=reference(l.variant_id),printProviderId=reference(l.print_provider_id);
  const lineKey=digest(canonical([providerLineId,externalLineId,productId,variantId,printProviderId]));
  const quantity=Number.isSafeInteger(l.quantity)&&l.quantity>0?l.quantity:null,productionCostCents=amount(l.cost),shippingCostCents=amount(l.shipping_cost),status=reference(l.status);
  return{lineKey,providerLineId,externalLineId,productId,variantId,printProviderId,quantity,rawProductionCost:rawAmount(l.cost),rawShippingCost:rawAmount(l.shipping_cost),productionCostCents,shippingCostCents,currency,currencyBasis,status,sentToProductionAt:timestamp(l.sent_to_production_at),fulfilledAt:timestamp(l.fulfilled_at),allocation:quantity===1?'single-unit':'unknown',basis:currency&&productionCostCents!==null&&shippingCostCents!==null?(status==='fulfilled'?'provider-recorded':'provisional'):'unknown',identityStatus:'unique'};
 });
 for(const line of lines)if(lines.filter(l=>l.lineKey===line.lineKey).length>1)line.identityStatus='ambiguous';
 return lines.sort((a,b)=>a.lineKey.localeCompare(b.lineKey)||canonical(a).localeCompare(canonical(b)));
}
/** Order cost observations, never retail total_price or catalog quotes. No quantity allocation is guessed. */
export function orderCostEvidence(order:Data,confirmedCurrency:unknown){
 const money=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
 const items=orderItemCosts(order,confirmedCurrency),currency=items[0]?.currency??null;
 const lines=Array.isArray(order.line_items)?order.line_items:[];
 const complete=!!currency&&items.every(l=>l.identityStatus==='unique')&&lines.length>0&&lines.every((l:Data)=>l.quantity===1&&money(l.cost)!==null&&money(l.shipping_cost)!==null);
 const sum=(key:string)=>{const n=lines.reduce((s:bigint,l:Data)=>s+BigInt(l[key]),0n);return n<=BigInt(Number.MAX_SAFE_INTEGER)?Number(n):null;};
 const itemShippingCostCents=complete?sum('shipping_cost'):null;
 // Order shipping includes charges absent from item shipping. Never add both.
 const shippingCostCents=currency?money(order.total_shipping):null;
 const shippingAdjustmentCents=shippingCostCents!==null&&itemShippingCostCents!==null?shippingCostCents-itemShippingCostCents:null;
 return{currency,currencyBasis:order.currency===currency&&currency?'provider':currency?'administrator-confirmed':'unknown',productionCostCents:complete?sum('cost'):null,shippingCostCents,itemShippingCostCents,shippingAdjustmentCents,shippingBasis:shippingCostCents===null?'unknown':'provider-order-total',basis:complete&&shippingCostCents!==null&&lines.every((l:Data)=>l.status==='fulfilled')?'provider-recorded':'incomplete',allocation:complete?'Production and item shipping: unit-quantity lines; order shipping: total_shipping; adjustment is unallocated':'Unknown: missing amounts/currency or multi-quantity allocation',reference:'https://developers.printify.com/#orders'};
}
