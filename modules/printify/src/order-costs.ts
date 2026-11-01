import type {Data} from '@steward/business-kit';
/** Order cost observations, never retail total_price or catalog quotes. No quantity allocation is guessed. */
export function orderCostEvidence(order:Data,confirmedCurrency:unknown){
 const money=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
 const currency=typeof order.currency==='string'&&/^[A-Z]{3}$/.test(order.currency)?order.currency:typeof confirmedCurrency==='string'&&/^[A-Z]{3}$/.test(confirmedCurrency)?confirmedCurrency:null;
 const lines=Array.isArray(order.line_items)?order.line_items:[];
 const complete=!!currency&&lines.length>0&&lines.every((l:Data)=>l.quantity===1&&money(l.cost)!==null&&money(l.shipping_cost)!==null);
 const sum=(key:string)=>{const n=lines.reduce((s:bigint,l:Data)=>s+BigInt(l[key]),0n);return n<=BigInt(Number.MAX_SAFE_INTEGER)?Number(n):null;};
 return{currency,currencyBasis:order.currency===currency&&currency?'provider':currency?'administrator-confirmed':'unknown',productionCostCents:complete?sum('cost'):null,shippingCostCents:complete?sum('shipping_cost'):null,basis:complete&&lines.every((l:Data)=>l.status==='fulfilled')?'provider-recorded':'incomplete',allocation:complete?'Unit-quantity lines; documented cost and shipping_cost fields':'Unknown: missing amounts/currency or multi-quantity allocation',reference:'https://developers.printify.com/#orders'};
}
