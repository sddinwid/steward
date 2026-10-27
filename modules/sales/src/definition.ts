import {simulationSales} from './simulation.js';
import {simulationContracts} from '@steward/simulation-kit';
import {financialAssessment,intelligence,exceptions} from './intelligence.js';
import { ensure, find, get, save, records, enqueue, enqueueCapability,publicRecord, object, text, amount, lines, uniqueLines, centsTotal, type Definition, type Context, type RecordValue, type Data } from '@steward/business-kit';
import {canonical,digest,validateCapabilityValue,type ModulePackageManifest} from '@steward/module-sdk';
import {contracts} from '@steward/commerce-kit';
import {acceptPrice,attachAccepted,knownLines,recordSourceObservation,reconciliation,priceReconciliation} from './accepted-price.js';
export function sales(manifest: ModulePackageManifest): Definition {
    return simulationSales({ manifest, resources: [financialAssessment,priceReconciliation,
            { kind: 'customer', path: '/customers', key: 'code', schema: object({ code: text(60), name: text(), reference: text(120) }) },
            { kind: 'order', path: '/orders', key: 'number', schema: object({ number: text(80), customerCode: text(60), currency: text(3), lines: lines() }), prepare: async (b, p, ctx) => {
                    ensure(!p || p.data.status === 'draft', 'Only draft sales orders can be edited');
                    ensure(!p?.data.channel,'Channel order facts must be updated through their authoritative adapter',409);
                    ensure(await find(ctx, 'customer', b.customerCode), 'Unknown customer');
                    ensure(b.currency === ctx.config.currency, 'Currency differs from configured currency');
                    uniqueLines(b.lines);
                    centsTotal(b.lines);
                    return { ...b, status: 'draft', stockStatus: 'not_requested', inventoryIntegration: false, reserved: {}, fulfilled: {}, reservationFailure: null };
                } },
            { kind: 'fulfillment', path: '/fulfillments', key: 'number', schema: object({ number: text(80), orderNumber: text(80), lines: lines(false) }), prepare: async (b, p, ctx) => {
                    ensure(!p, 'Fulfillment records are immutable');
                    uniqueLines(b.lines);
                    const order = await find(ctx, 'order', b.orderNumber);
                    ensure(order && ['confirmed', 'partially_fulfilled'].includes(order.data.status), 'Order must be confirmed before fulfillment');
                    ensure(!order.data.channel||order.data.productionStatus==='shipped','Channel fulfillment requires authoritative production shipment');
                    ensure(order.data.stockStatus !== 'pending' && order.data.stockStatus !== 'rejected', 'Inventory reservation is not ready');
                    const pending = (await records(ctx, 'fulfillment')).filter(v => v.data.orderNumber === order.key && v.data.status === 'pending');
                    ensure(pending.length === 0, 'An earlier fulfillment is awaiting Inventory acknowledgment', 409);
                    for (const line of b.lines) {
                        const original = order.data.lines.find((v: Data) => v.sku === line.sku);
                        ensure(original && line.quantity <= original.quantity - (Object.hasOwn(order.data.fulfilled, line.sku) ? order.data.fulfilled[line.sku] : 0), 'Fulfillment exceeds outstanding order quantity');
                        if (order.data.inventoryIntegration)
                            ensure(line.quantity <= (Object.hasOwn(order.data.reserved, line.sku) ? order.data.reserved[line.sku] : 0), 'Insufficient reserved stock');
                    }
                    return { ...b, status: order.data.inventoryIntegration ? 'pending' : 'completed' };
                }, after: async (r, _p, ctx) => { const order = (await find(ctx, 'order', r.data.orderNumber))!; if (order.data.inventoryIntegration)
                    await stock(ctx,order,'stock.consume',{ orderId: order.id, fulfillmentId: r.id, lines: r.data.lines });
                else
                    await complete(ctx, order, r.data.lines); } }
        ], actions: [
            { path: '/confirm/:id', permission: 'cee.sales.write', kind: 'order', run: async (r, ctx) => {
                    ensure(r.data.status === 'draft', 'Only a draft order can be confirmed');
                    ensure(!r.data.channel||['paid','partially_refunded'].includes(r.data.financialStatus)&&!r.data.remoteCanceled,'Channel order must be paid and not canceled');
                    await acceptPrice(ctx,r);
                    const active = ctx.config.integrationsEnabled === true;
                    const updated = await save(ctx, 'order', r.key, { ...r.data, status: 'confirmed', inventoryIntegration: active,smartInventory:ctx.config.smartInventory===true, stockStatus: active ? 'pending' : 'not_requested' }, r);
                    if (active)
                        await stock(ctx,updated,'stock.reserve',{ orderId: r.id, lines: r.data.lines.map((v: Data) => ({ sku: v.sku, quantity: v.quantity })) });
                    return { record: publicRecord(updated) };
                } },
            { path: '/cancel/:id', permission: 'cee.sales.write', kind: 'order', run: async (r, ctx) => {
                    ensure(['draft', 'confirmed', 'partially_fulfilled'].includes(r.data.status), 'Order cannot be canceled');
                    ensure(!r.data.productionRequested,'Production has been requested; reconcile its cancellation before releasing stock',409);
                    ensure(!(await records(ctx, 'fulfillment')).some(v => v.data.orderNumber === r.key && v.data.status === 'pending'), 'Cannot cancel while a fulfillment is pending', 409);
                    const release = r.data.inventoryIntegration && r.data.stockStatus !== 'not_requested';
                    if (release)
                        await stock(ctx,r,'stock.release',{ orderId: r.id });
                    return { record: publicRecord(await save(ctx, 'order', r.key, { ...r.data, status: 'canceled', stockStatus: release ? 'release_pending' : r.data.stockStatus }, r)) };
                } },
            {path:'/production/:id',kind:'order',permission:'cee.sales.production.authorize',run:async(r,ctx)=>{
                ensure(r.data.smartInventory&&r.data.inventoryIntegration&&r.data.status==='confirmed'&&r.data.stockStatus==='reserved'&&!r.data.productionRequested&&!r.data.remoteCanceled,'A confirmed, paid, fully reserved order is required');
                ensure(r.data.lines.every((l:Data)=>r.data.reserved[l.sku]===l.quantity),'Production cannot exceed authoritative reserved stock');
                await enqueueCapability(ctx,r.data.simulation?simulationContracts.fulfillment.id:contracts.production!.id,'fulfillment.submit',r.id,{orderId:r.id,currency:r.data.currency,lines:r.data.lines.map((l:Data)=>({sku:l.sku,quantity:l.quantity}))});
                return{record:publicRecord(await save(ctx,'order',r.key,{...r.data,productionRequested:true,productionRequestedAt:new Date().toISOString(),productionStatus:'intent_pending'},r))};
            }},
            {path:'/publish-commerce/:id',kind:'order',permission:'cee.sales.publish',run:async(r,ctx)=>{ensure(r.data.channel,'Only source-attributed commerce orders can be published');return{record:publicRecord(await save(ctx,'order',r.key,{...r.data,commerceApproved:true},r))};}},
            {path:'/withdraw-commerce/:id',kind:'order',permission:'cee.sales.publish',run:async(r,ctx)=>({record:publicRecord(await save(ctx,'order',r.key,{...r.data,commerceApproved:false},r))})}
        ], acknowledge: async (command, status, result, ctx) => {
            const order = await get(ctx, 'order', command.aggregateId);
            if (command.command === 'stock.reserve') {
                const reserved = Object.create(null);
                if (status === 'delivered') {
                    ensure(Array.isArray(result.lines), 'Invalid reservation acknowledgment');
                    for (const line of result.lines) {
                        ensure(typeof line.sku === 'string' && Number.isSafeInteger(line.reserved) && line.reserved >= 0, 'Invalid reservation result');
                        reserved[line.sku] = line.reserved;
                    }
                }
                await save(ctx, 'order', order.key, { ...order.data, reserved,reservationEvidence:status==='delivered'?result.lines:null, stockStatus: order.data.status === 'canceled' ? 'release_pending' : status === 'delivered' ? 'reserved' : 'rejected', reservationFailure: status === 'rejected' ? 'Inventory rejected reservation' : null }, order);
            }
            else if (command.command === 'stock.release')
                await save(ctx, 'order', order.key, { ...order.data, reserved: status === 'delivered' ? {} : order.data.reserved, stockStatus: status === 'delivered' ? 'released' : 'release_rejected' }, order);
            else if (command.command === 'stock.consume') {
                const fulfillment = await get(ctx, 'fulfillment', String(command.payload.fulfillmentId));
                await save(ctx, 'fulfillment', fulfillment.key, { ...fulfillment.data, status: status === 'delivered' ? 'completed' : 'rejected' }, fulfillment);
                if (status === 'delivered')
                    await complete(ctx, order, fulfillment.data.lines);
            }
            else if(command.command==='fulfillment.submit')await save(ctx,'order',order.key,{...order.data,productionStatus:status==='delivered'?'awaiting_authorization':'intent_rejected',productionJobId:result.jobId??null,productionProviderId:result._steward?.providerModuleId??null},order);
            else if(command.command==='fulfillment.cancel'){if(status==='delivered'&&result.canceled){await stock(ctx,order,'stock.release',{orderId:order.id});await save(ctx,'order',order.key,{...order.data,status:'canceled',stockStatus:'release_pending',productionStatus:'canceled'},order);}else await save(ctx,'order',order.key,{...order.data,reconciliationRequired:true},order);}
            else if(command.command==='channel.fulfillment')await save(ctx,'order',order.key,{...order.data,channelDeliveryStatus:status==='delivered'?'queued':'rejected'},order);
        },receive:receiveCommerce,queries:[{path:'/price-reconciliation',run:reconciliation},{path:'/commerce-intelligence',run:intelligence},{path:'/commerce-exceptions',run:exceptions},{path:'/sales-period',run:(ctx,query)=>salesReport(ctx,query)}],report:(ctx)=>salesReport(ctx) });
}
async function salesReport(ctx:Context,query:Record<string,string>={}){
    const timestamp=(value:string|undefined)=>{if(value===undefined)return null;ensure(Number.isFinite(Date.parse(value)),'Invalid reporting timestamp',400);return new Date(value).toISOString();};
    const from=timestamp(query.from),to=timestamp(query.to);ensure(!from||!to||from<to,'Report from must precede exclusive to',400);
    const orders=await attachAccepted(ctx,await records(ctx,'order')),byNumber=new Map(orders.map(r=>[r.key,r]));
    // Window over preceding completed quantities before filtering the requested
    // period. Only the selected period is bounded/paginated into application memory.
    const fulfilled=(await ctx.db.query(`WITH cumulative AS (
      SELECT b.id,b.data,b.updated_at,l.value AS line,
       sum((l.value->>'quantity')::bigint) OVER (PARTITION BY b.data->>'orderNumber',l.value->>'sku' ORDER BY b.updated_at,b.id ROWS UNBOUNDED PRECEDING) AS quantity_after
      FROM business_records b CROSS JOIN LATERAL jsonb_array_elements(b.data->'lines') l
      WHERE b.kind='fulfillment' AND b.data->>'status'='completed' AND ($2::timestamptz IS NULL OR b.updated_at<$2)
     ), movements AS (
      SELECT id,data,updated_at,jsonb_object_agg(line->>'sku',quantity_after::text) AS quantities FROM cumulative GROUP BY id,data,updated_at
     ) SELECT * FROM movements WHERE ($1::timestamptz IS NULL OR updated_at >= $1) ORDER BY updated_at,id LIMIT 10001`,[from,to])).rows;
    ensure(fulfilled.length<=10000,'Reporting limit reached; narrow the time period',413);const totals=new Map<string,number>();let unknownFulfillments=0;
    for(const row of fulfilled){const order=byNumber.get(row.data.orderNumber);ensure(order,'Source sales order unavailable');const accepted=knownLines(order.data);if(!accepted){unknownFulfillments++;continue;}for(const line of row.data.lines){const price=accepted.find((v:Data)=>v.sku===line.sku);ensure(price,'Accepted order line unavailable');const after=BigInt(row.quantities[line.sku]),before=after-BigInt(line.quantity);ensure(after<=BigInt(price.quantity),'Fulfillment exceeds accepted quantity',409);const net=BigInt(price.lineRevenueCents),quantity=BigInt(price.quantity),lineAmount=Number(net*after/quantity-net*before/quantity);const amount=(totals.get(order.data.currency)??0)+lineAmount;ensure(Number.isSafeInteger(amount),'Revenue exceeds supported bounds');totals.set(order.data.currency,amount);}}
    const count=Number((await ctx.db.query("SELECT count(*) AS n FROM business_records WHERE kind='order' AND ($1::timestamptz IS NULL OR created_at >= $1) AND ($2::timestamptz IS NULL OR created_at < $2)",[from,to])).rows[0].n);
    const currencies=[...totals.keys()];return{currency:currencies.length===1?currencies[0]:currencies.length?null:ctx.config.currency,revenueCents:!unknownFulfillments&&currencies.length<=1?(totals.get(currencies[0]??'')??0):null,unknownFulfillments,totalsByCurrency:[...totals].map(([currency,revenueCents])=>({currency,revenueCents,coverage:unknownFulfillments?'known subtotal':'complete'})),orderCount:count,fulfillmentCount:fulfilled.length,period:{from,to,fromInclusive:true,toExclusive:true,revenueBasis:'Completed fulfillment updated_at; cumulative line allocation',orderVolumeBasis:'Order created_at'},outstandingOrders:orders.filter(v=>['confirmed','partially_fulfilled'].includes(v.data.status)).slice(0,20).map(v=>({number:v.key,status:v.data.status,stockStatus:v.data.stockStatus})),records:[],source:'Actual completed fulfillment quantities at immutable accepted prices. Unknown legacy acceptance is excluded from known subtotals and makes the total unknown. Pending/rejected movements excluded.'};
}
async function complete(ctx: Context, order: RecordValue, lines: Data[]) {
    const fulfilled = Object.assign(Object.create(null), order.data.fulfilled), reserved = Object.assign(Object.create(null), order.data.reserved);
    for (const line of lines) {
        fulfilled[line.sku] = (fulfilled[line.sku] ?? 0) + line.quantity;
        if (order.data.inventoryIntegration)
            reserved[line.sku] = (reserved[line.sku] ?? 0) - line.quantity;
    }
    const all = order.data.lines.every((v: Data) => fulfilled[v.sku] === v.quantity);
    await save(ctx, 'order', order.key, { ...order.data, fulfilled, reserved, status: all ? 'fulfilled' : 'partially_fulfilled',...(all?{completedAt:new Date().toISOString()}:{}) }, order);
    if(all&&order.data.channel&&order.data.productionTracking){await enqueueCapability(ctx,order.data.simulation?simulationContracts.channel.id:contracts.channel!.id,'channel.fulfillment',order.id,{sourceId:order.data.sourceId,orderId:order.id,tracking:order.data.productionTracking,lines:order.data.lines.map((l:Data)=>({sku:l.sku,quantity:l.quantity}))});}
}
async function stock(ctx:Context,order:RecordValue,command:string,payload:Data){return order.data.simulation?enqueueCapability(ctx,simulationContracts.reserve.id,command,order.id,payload):order.data.smartInventory?enqueueCapability(ctx,contracts.stock!.id,command,order.id,payload):enqueue(ctx,'cee.inventory',command,order.id,payload);}
async function receiveCommerce(command:import('@steward/module-sdk').IntegrationCommand,ctx:Context):Promise<Data>{
 const b=command.payload as Data;
 if(command.command==='commerce.order.import'){
  validateCapabilityValue(b,contracts.orders!.operations[0]!.input);ensure(b.currency===ctx.config.currency,'Channel currency mismatch');uniqueLines(b.lines);ensure(Number.isFinite(Date.parse(b.sourceUpdatedAt)),'Invalid source timestamp');
  ensure(Buffer.byteLength(JSON.stringify(b.lines))<=6500,'Channel order exceeds the bounded projection size; review or split its lines',422);
  await recordSourceObservation(ctx,command);
  const key='CH-'+digest(command.sourceModuleId+':'+b.sourceId).slice(0,40),old=await find(ctx,'order',key);
  const incoming=(ctx as Context&{incomingProviderIdentity?:Data}).incomingProviderIdentity;
  if(old?.data.sourceProviderIdentity&&canonical(old.data.sourceProviderIdentity)!==canonical(incoming??null)){
   await ctx.db.query('INSERT INTO sales_price_reconciliations(order_id,actor,decision) VALUES($1,$2,$3)',[old.id,ctx.actor,{kind:'source-provider-changed',commandId:command.commandId,provider:incoming??null}]);
   await save(ctx,'order',old.key,{...old.data,priceReconciliationRequired:true},old);
   return{orderId:old.id,status:old.data.status};
  }
  if(old&&Date.parse(old.data.sourceUpdatedAt)>Date.parse(b.sourceUpdatedAt))return{orderId:old.id,status:old.data.status};
  const localLines=(b.lines as Data[]).map(l=>({sku:l.sku,quantity:l.quantity,unitPriceCents:l.unitPriceCents}));
  centsTotal(localLines);
  const accepted=old&&old.data.status!=='draft';
  const commercialChange=accepted&&(canonical(old.data.lines)!==canonical(localLines)||canonical(old.data.sourceLines)!==canonical(b.lines)||old.data.currency!==b.currency);
  const customer='channel-'+digest(command.sourceModuleId+(ctx.simulation?':'+ctx.simulation.datasetId+':'+ctx.simulation.runId:'')).slice(0,16);if(!await find(ctx,'customer',customer))await save(ctx,'customer',customer,{code:customer,name:'Channel customer — no personal information imported',reference:'source-adapter'});
  ensure(Number.isFinite(Date.parse(b.sourceCreatedAt)),'Invalid source creation timestamp');
  if(commercialChange)await ctx.db.query('INSERT INTO sales_price_reconciliations(order_id,actor,decision) VALUES($1,$2,$3)',[old!.id,ctx.actor,{kind:'source-commercial-change',commandId:command.commandId,sourceModuleId:command.sourceModuleId,sourceUpdatedAt:b.sourceUpdatedAt}]);
  const data={status:b.canceled?'canceled':'draft',stockStatus:'not_requested',inventoryIntegration:false,reserved:{},fulfilled:{},reservationFailure:null,commerceApproved:false,createdAt:b.sourceCreatedAt,...(!old&&incoming?{sourceProviderIdentity:incoming}:{}),...old?.data,number:key,customerCode:customer,currency:accepted?old!.data.currency:b.currency,lines:accepted?old!.data.lines:localLines,sourceLines:accepted?old!.data.sourceLines:b.lines,...(commercialChange?{priceReconciliationRequired:true}:{}),sourceId:b.sourceId,sourceModuleId:command.sourceModuleId,sourceUpdatedAt:b.sourceUpdatedAt,channel:b.channel,financialStatus:b.financialStatus,remoteFulfillmentStatus:b.fulfillmentStatus,remoteCanceled:b.canceled,refundCents:b.refundCents};
  let r=await save(ctx,'order',key,data,old);
  if(b.canceled&&old&&!old.data.remoteCanceled){if(old.data.productionRequested){await enqueueCapability(ctx,old.data.simulation?simulationContracts.fulfillment.id:contracts.production!.id,'fulfillment.cancel',r.id,{orderId:r.id});}else if(old.data.inventoryIntegration){await stock(ctx,r,'stock.release',{orderId:r.id});r=await save(ctx,'order',key,{...r.data,status:'canceled',stockStatus:'release_pending'},r);}else r=await save(ctx,'order',key,{...r.data,status:'canceled'},r);}
  return{orderId:r.id,status:r.data.status};
 }
 ensure(command.command==='fulfillment.progress','Unsupported commerce operation',403);validateCapabilityValue(b,contracts.status!.operations[0]!.input);const order=await get(ctx,'order',String(b.orderId));ensure(order.data.productionRequested&&order.data.currency===b.currency,'Unknown authorized production order',403);
 ensure(order.data.productionProviderId,'Production provider receipt has not arrived',503);ensure(order.data.productionProviderId===command.sourceModuleId,'Wrong production provider',403);
 ensure(Number.isFinite(Date.parse(b.updatedAt)),'Invalid production observation time');
 if(order.data.productionObservedAt&&Date.parse(order.data.productionObservedAt)>Date.parse(b.updatedAt))return{recorded:true};
 const updated=await save(ctx,'order',order.key,{...order.data,productionStatus:b.status,productionSourceId:b.sourceId,productionObservedAt:b.updatedAt,productionCostCents:b.productionCostCents,shippingCostCents:b.shippingCostCents,costBasis:b.costBasis,productionTracking:b.tracking},order);
 if(b.status==='shipped'&&updated.data.status!=='fulfilled'){
  const number='EXT-'+order.id,old=await find(ctx,'fulfillment',number);if(!old){const lines=order.data.lines.map((l:Data)=>({sku:l.sku,quantity:l.quantity}));const f=await save(ctx,'fulfillment',number,{number,orderNumber:order.key,lines,status:'pending'});await stock(ctx,updated,'stock.consume',{orderId:order.id,fulfillmentId:f.id,lines});}
 }
 return{recorded:true};
}
