/** Deterministic merchandise contribution analysis. All monetary inputs are integer minor units. */
export type CostBasis = 'known' | 'estimated' | 'incomplete';
export interface FinancialDetails {
  productionCostCents: number | null; shippingCostCents: number | null;
  transactionFeeCents: number | null; channelFeeCents: number | null;
  basis: CostBasis; reference: string;
}
export interface CommerceFacts {
  sourceId: string; channel: string; currency: string; orderCreatedAt: string;
  fulfilledAt: string | null; status: string; productionStatus: string | null;
  recognizedRevenueCents: number; refundCents: number;
  productionCostCents: number | null; shippingCostCents: number | null; costBasis: CostBasis;
  products: {sku: string; quantity: number; unitPriceCents: number; lineRevenueCents: number; fulfilledQuantity: number; recognizedRevenueCents: number}[];
  financials?: FinancialDetails | undefined;
}
const money = (v: number) => { if (!Number.isSafeInteger(v) || v < 0) throw new Error('Invalid monetary amount'); return BigInt(v); };
const exact = (v: bigint) => { const n = Number(v); if (!Number.isSafeInteger(n)) throw new Error('Financial calculation exceeds exact bounds'); return n; };
const sum = (values: number[]) => exact(values.reduce((n,v) => n + money(v), 0n));
const signedSum = (values: number[]) => exact(values.reduce((n,v) => { if (!Number.isSafeInteger(v)) throw new Error('Invalid amount'); return n + BigInt(v); },0n));
export function orderProfitability(order: CommerceFacts) {
  if (!/^[A-Z]{3}$/.test(order.currency) || !Number.isFinite(Date.parse(order.orderCreatedAt))) throw new Error('Invalid commerce facts');
  if (!order.products.length || new Set(order.products.map(p=>p.sku)).size !== order.products.length) throw new Error('Duplicate or missing product');
  for(const p of order.products)if(!Number.isSafeInteger(p.quantity)||p.quantity<1||!Number.isSafeInteger(p.fulfilledQuantity)||p.fulfilledQuantity<0||p.fulfilledQuantity>p.quantity)throw new Error('Invalid merchandise quantities');
  const gross = sum(order.products.map(p=>exact(money(p.unitPriceCents)*money(p.quantity))));
  const booked = sum(order.products.map(p=>p.lineRevenueCents));
  if (booked > gross) throw new Error('Discounted merchandise value exceeds gross sales');
  const recognized = exact(money(order.recognizedRevenueCents)), refunds = exact(money(order.refundCents));
  if(recognized>booked)throw new Error('Recognized revenue exceeds booked merchandise');
  const details = order.financials;
  const components = {
    production: details ? details.productionCostCents : order.productionCostCents,
    shipping: details ? details.shippingCostCents : order.shippingCostCents,
    transactionFees: details?.transactionFeeCents ?? null,
    channelFees: details?.channelFeeCents ?? null
  };
  const missing = Object.entries(components).filter(([,v])=>v === null).map(([k])=>k);
  const subtotal = sum(Object.values(components).filter((v): v is number=>v !== null));
  const basis = details?.basis ?? order.costBasis;
  const complete = !missing.length && basis !== 'incomplete';
  // Do not subtract whole-order costs from partially recognized revenue and call it a comparable margin.
  const recognitionComplete = order.products.every(p=>p.fulfilledQuantity === p.quantity);
  const net = exact(BigInt(recognized)-BigInt(refunds));
  const margin = complete && recognitionComplete ? exact(BigInt(net)-BigInt(subtotal)) : null;
  return {sourceId:order.sourceId,channel:order.channel,currency:order.currency,status:order.status,
    grossSalesCents:gross,discountCents:exact(BigInt(gross)-BigInt(booked)),bookedRevenueCents:booked,
    recognizedRevenueCents:recognized,refundCents:refunds,netRecognizedRevenueCents:net,
    productionCostCents:components.production,shippingCostCents:components.shipping,
    transactionFeeCents:components.transactionFees,channelFeeCents:components.channelFees,
    recordedCostSubtotalCents:subtotal,totalCostCents:complete?subtotal:null,missingCosts:missing,
    contributionMarginCents:margin,marginBasis:margin===null?'incomplete':basis,
    contributionMarginBasisPoints:margin!==null&&net>0?exact(BigInt(margin)*10000n/BigInt(net)):null,
    recognitionComplete,costReference:details?.reference??'Provider cost observations; catalog and shipping quotes are estimates',
    explanation:'Gross less source discounts gives booked merchandise revenue. Completed merchandise revenue less source refunds and all four recorded cost components gives contribution margin. Excludes tax, shipping income, overhead and income tax; refunds can include non-merchandise amounts. Partial recognition and unknown costs prevent a complete margin.'};
}
export function commerceIntelligence(orders: CommerceFacts[]) {
  if (orders.length>10000) throw new Error('Narrow the reporting period; more than 10000 source orders');
  if (new Set(orders.map(o=>o.channel+'\0'+o.sourceId)).size!==orders.length) throw new Error('Duplicate source order');
  return [...new Set(orders.map(o=>o.currency))].sort().map(currency=>{
    const selected=orders.filter(o=>o.currency===currency), rows=selected.map(orderProfitability);
    const active=rows.filter(o=>o.status!=='canceled');
    const total=(key:'grossSalesCents'|'discountCents'|'bookedRevenueCents'|'recognizedRevenueCents'|'refundCents')=>sum(rows.map(v=>v[key]));
    const products=[...new Set(selected.flatMap(o=>o.products.map(p=>p.sku)))].sort().map(sku=>{
      const relevant=selected.filter(o=>o.products.some(p=>p.sku===sku));
      const lines=relevant.flatMap(o=>o.products.filter(p=>p.sku===sku));
      const allocated=relevant.every(o=>o.products.length===1), calculations=relevant.map(orderProfitability);
      return {sku,quantity:sum(lines.map(p=>p.quantity)),fulfilledQuantity:sum(lines.map(p=>p.fulfilledQuantity)),
        recognizedRevenueCents:sum(lines.map(p=>p.recognizedRevenueCents)),
        contributionMarginCents:allocated&&calculations.every(c=>c.contributionMarginCents!==null)?signedSum(calculations.map(c=>c.contributionMarginCents!)):null,
        allocation:allocated?'Single-SKU order costs and refunds':'Order costs and refunds are not allocated across products'};
    });
    return {currency,orderVolume:rows.length,activeOrders:active.length,canceledOrders:rows.length-active.length,
      refundedOrders:rows.filter(o=>o.refundCents>0).length,grossSalesCents:total('grossSalesCents'),discountCents:total('discountCents'),
      bookedRevenueCents:total('bookedRevenueCents'),recognizedRevenueCents:total('recognizedRevenueCents'),refundCents:total('refundCents'),
      averageOrderValueCents:active.length?exact(BigInt(sum(active.map(o=>o.bookedRevenueCents)))/BigInt(active.length)):null,
      productionCostCents:rows.every(o=>o.productionCostCents!==null)?sum(rows.map(o=>o.productionCostCents!)):null,
      shippingCostCents:rows.every(o=>o.shippingCostCents!==null)?sum(rows.map(o=>o.shippingCostCents!)):null,
      contributionMarginCents:rows.every(o=>o.contributionMarginCents!==null)?signedSum(rows.map(o=>o.contributionMarginCents!)):null,
      completeMarginOrders:rows.filter(o=>o.contributionMarginCents!==null).length,
      marginBasis:rows.every(o=>o.marginBasis==='known')?'known':rows.every(o=>o.marginBasis!=='incomplete')?'estimated':'incomplete',
      orders:rows,products,decisionExecuted:false};
  });
}
export interface ExceptionObservation {sourceId:string; code:string; explanation:string; severity:'warning'|'critical';}
/** Stable condition keys do not contain timestamps/revisions, so polling cannot manufacture new alerts. */
export function commerceExceptions(order: CommerceFacts, now=Date.now()): ExceptionObservation[] {
  const issues:ExceptionObservation[]=[];
  const add=(code:string,explanation:string,severity:'warning'|'critical'='warning')=>issues.push({sourceId:order.sourceId,code,explanation,severity});
  if(order.status==='canceled')return issues;
  if(order.productionStatus==='failed')add('production_failed','Production failed; reconcile with the original provider before retrying.','critical');
  if(['intent_pending','awaiting_authorization','awaiting_production_authorization'].includes(order.productionStatus??''))add('production_authorization','Production authorization is outstanding.');
  if(['uncertain','reconciling'].includes(order.productionStatus??''))add('production_uncertain','Production outcome is uncertain. Reconciliation is required; do not resubmit.','critical');
  if(!order.fulfilledAt&&now-Date.parse(order.orderCreatedAt)>48*3600000)add('fulfillment_delayed','Order is not completely fulfilled more than 48 hours after creation.');
  if(orderProfitability(order).missingCosts.length)add('costs_incomplete','Supplier costs or channel/transaction fees are missing; contribution margin is unknown.');
  return issues;
}
