import {withProcurementCosts} from './cost-evidence.js';
import {supplierReferenceReceive,supplierReferenceQuery} from './supplier-references.js';
import { ensure, find, get, save, records, enqueue, publicRecord, object, text, quantity, amount, choice, lines, uniqueLines, centsTotal, type Definition, type Context, type RecordValue, type Data } from '@steward/business-kit';
import type { ModulePackageManifest } from '@steward/module-sdk';
import {serviceSource,privateReplenishments,serviceActions,serviceProgramAuthority,receiveServiceReplenishment,authorizeServiceReplenishment} from './service-replenishment.js';
const permission = 'cee.procurement.';
const total = (r: RecordValue) => centsTotal(r.data.lines) + r.data.shippingCents;
async function project(ctx: Context, r: RecordValue, stream: 'procurement_demands' | 'procurement_quotes', data: Data) {
    await ctx.db.query(`INSERT INTO ${stream}(id,revision,projection) VALUES($1,1,$2) ON CONFLICT(id) DO UPDATE SET revision=${stream}.revision+1,projection=excluded.projection`, [r.id, data]);
}
export function procurement(manifest: ModulePackageManifest): Definition {
    return withProcurementCosts({ manifest,authorize:async(ctx,a)=>{if(a.operation==='integration-receive'&&a.command?.command==='service-replenishment.draft')await authorizeServiceReplenishment(a.command,ctx);},auditAccess:async(e,db)=>{await db.query('INSERT INTO procurement_service_audit(actor_id,operation,status_code) VALUES($1,$2,$3)',[e.actor,e.operationId,e.statusCode]);},queries:[{path:'/supplier-references',run:supplierReferenceQuery},{path:'/program-authority',run:serviceProgramAuthority}], resources: [serviceSource,privateReplenishments,
            { kind: 'supplier', path: '/suppliers', key: 'code', schema: object({ code: text(60), name: text(), relationship: choice(['external', 'ecosystem']) }) },
            { kind: 'requisition', path: '/requisitions', key: 'number', schema: object({ number: text(80), supplierCode: text(60), sku: text(80), quantity, reason: text(500), currency: text(3), unitPriceCents: amount, shippingCents: amount, transitionCents: amount }), prepare: async (b, p, ctx) => {
                    ensure(!p || p.data.status === 'draft', 'Published requisition is immutable; create a new revision document');
                    const supplier = await find(ctx, 'supplier', b.supplierCode);
                    ensure(supplier?.data.relationship === 'external', 'Baseline requisition requires a known external supplier');
                    ensure(b.currency === ctx.config.currency, 'Currency differs from configured currency');
                    return { ...b, status: p?.data.status ?? 'draft', sourceEvent: p?.data.sourceEvent ?? null, sourceInventoryItemId: p?.data.sourceInventoryItemId ?? null };
                } },
            { kind: 'order', path: '/orders', key: 'number', schema: object({ number: text(80), supplierCode: text(60), lines: lines(), shippingCents: amount, currency: text(3) }), prepare: async (b, p, ctx) => {
                    ensure(!p || p.data.status === 'draft', 'Only draft purchase orders can be edited');
                    ensure(await find(ctx, 'supplier', b.supplierCode), 'Unknown supplier');
                    ensure(b.currency === ctx.config.currency, 'Currency differs from configured currency');
                    uniqueLines(b.lines);
                    centsTotal(b.lines);
                    return { ...b, status: 'draft', received: {} };
                } },
            { kind: 'receipt', path: '/receipts', key: 'number', schema: object({ number: text(80), orderNumber: text(80), lines: lines(false) }), prepare: async (b, p, ctx) => {
                    ensure(!p, 'Receipts are immutable');
                    uniqueLines(b.lines);
                    const order = await find(ctx, 'order', b.orderNumber);
                    ensure(order, 'Unknown purchase order');
                    ensure(['ordered', 'partially_received'].includes(order.data.status), 'Order must be ordered before receiving');
                    const received = Object.assign(Object.create(null), order.data.received);
                    for (const line of b.lines) {
                        const original = order.data.lines.find((v: Data) => v.sku === line.sku);
                        ensure(original, 'Receipt contains a SKU outside this order');
                        const next = (received[line.sku] ?? 0) + line.quantity;
                        ensure(next <= original.quantity, 'Receipt exceeds outstanding quantity');
                        received[line.sku] = next;
                    }
                    const complete = order.data.lines.every((v: Data) => received[v.sku] === v.quantity);
                    await save(ctx, 'order', order.key, { ...order.data, received, status: complete ? 'received' : 'partially_received' }, order);
                    return { ...b, stockStatus: ctx.config.integrationsEnabled ? 'pending' : 'not_requested' };
                }, after: async (r, _p, ctx) => { if (ctx.config.integrationsEnabled)
                    await enqueue(ctx, 'cee.inventory', 'goods.received', r.id, { receiptId: r.id, orderNumber: r.data.orderNumber, lines: r.data.lines }); } },
            { kind: 'quote', path: '/quotes', key: 'number', schema: object({ number: text(80), supplierCode: text(60), sku: text(80), minimumQuantity: quantity, unitPriceCents: amount, shippingCents: amount, currency: text(3), validUntil: text(40) }), prepare: async (b, p, ctx) => {
                    ensure(!p || p.data.status === 'draft', 'Approved quote is immutable');
                    const supplier = await find(ctx, 'supplier', b.supplierCode);
                    ensure(supplier, 'Unknown supplier');
                    ensure(b.currency === ctx.config.currency, 'Currency differs from configured currency');
                    ensure(Number.isFinite(Date.parse(b.validUntil)) && Date.parse(b.validUntil) > Date.now(), 'Quote validity must be a future ISO timestamp');
                    return { ...b, validUntil: new Date(b.validUntil).toISOString(), relationship: supplier.data.relationship, status: 'draft' };
                } }
        ], actions: [...serviceActions,
            ...[{ kind: 'requisition', path: '/withdraw-demand/:id', table: 'procurement_demands' }, { kind: 'quote', path: '/withdraw-quote/:id', table: 'procurement_quotes' }].map(t => ({ path: t.path, permission: permission + 'approve', kind: t.kind, run: async (r: RecordValue, ctx: Context) => { ensure(['approved', 'withdrawn'].includes(r.data.status), 'Only an approved projection can be withdrawn'); await ctx.db.query(`UPDATE ${t.table} SET revision=revision+1,projection=jsonb_set(projection,'{approved}','false') WHERE id=$1 AND projection->>'approved'='true'`, [r.id]); return { record: publicRecord(r.data.status === 'withdrawn' ? r : await save(ctx, t.kind, r.key, { ...r.data, status: 'withdrawn' }, r)) }; } })),
            ...[{ name: 'submit', from: ['draft'], to: 'submitted', right: 'write' }, { name: 'approve', from: ['submitted'], to: 'approved', right: 'approve' }, { name: 'place', from: ['approved'], to: 'ordered', right: 'approve' }, { name: 'cancel', from: ['draft', 'submitted', 'approved', 'ordered'], to: 'canceled', right: 'approve' }].map(t => ({ path: `/${t.name}/:id`, permission: permission + t.right, kind: 'order', run: async (r: RecordValue, ctx: Context) => {
                    ensure(t.from.includes(r.data.status), 'Invalid purchase order transition');
                    return { record: publicRecord(await save(ctx, 'order', r.key, { ...r.data, status: t.to }, r)) };
                } })),
            { path: '/publish-demand/:id', permission: permission + 'approve', kind: 'requisition', run: async (r, ctx) => {
                    ensure(r.data.status === 'draft', 'Demand already approved');
                    ensure(r.data.unitPriceCents > 0, 'Approved demand requires an actual baseline external price');
                    await project(ctx, r, 'procurement_demands', { ...r.data, approved: true, unit: 'units', baselineExternal: true });
                    return { record: publicRecord(await save(ctx, 'requisition', r.key, { ...r.data, status: 'approved' }, r)) };
                } },
            { path: '/publish-quote/:id', permission: permission + 'approve', kind: 'quote', run: async (r, ctx) => {
                    ensure(r.data.status === 'draft' && r.data.relationship === 'external', 'Only an external supplier quote can support ecosystem cost savings');
                    await project(ctx, r, 'procurement_quotes', { ...r.data, approved: true, unit: 'units' });
                    return { record: publicRecord(await save(ctx, 'quote', r.key, { ...r.data, status: 'approved' }, r)) };
                } },
            { path: '/retry-stock/:id', permission: permission + 'approve', kind: 'receipt', run: async (r, ctx) => {
                    ensure(r.data.stockStatus === 'rejected' && ctx.config.integrationsEnabled, 'Only rejected stock delivery can be explicitly retried');
                    await enqueue(ctx, 'cee.inventory', 'goods.received', r.id, { receiptId: r.id, orderNumber: r.data.orderNumber, lines: r.data.lines });
                    return { record: publicRecord(await save(ctx, 'receipt', r.key, { ...r.data, stockStatus: 'pending' }, r)) };
                } }
        ], receive: async (command, ctx) => {
            const read=await supplierReferenceReceive(command,ctx);if(read)return read;
            if(command.command==='service-replenishment.draft')return receiveServiceReplenishment(command,ctx);
            ensure(command.command === 'stock.replenishment' && command.sourceModuleId === 'cee.inventory', 'Unsupported replenishment source', 403);
            const b = command.payload;
            ensure(typeof b.sku === 'string' && b.sku.length <= 80 && typeof b.quantity === 'number' && Number.isSafeInteger(b.quantity) && b.quantity > 0 && b.quantity <= 100000000, 'Invalid replenishment request');
            const r = await save(ctx, 'requisition', 'replenishment-' + command.commandId, { number: 'replenishment-' + command.commandId, supplierCode: '', sku: b.sku, quantity: b.quantity, reason: 'Inventory low-stock event; human pricing and approval required', currency: ctx.config.currency, unitPriceCents: 0, shippingCents: 0, transitionCents: 0, status: 'draft', sourceEvent: command.commandId, sourceInventoryItemId: b.itemId ?? null });
            return { requisitionId: r.id, status: 'draft' };
        }, acknowledge: async (command, status, _result, ctx) => {
            const r = await get(ctx, 'receipt', command.aggregateId);
            await save(ctx, 'receipt', r.key, { ...r.data, stockStatus: status === 'delivered' ? 'applied' : 'rejected' }, r);
        }, report: async (ctx) => {
            const orders = await records(ctx, 'order'), receipts = await records(ctx, 'receipt');
            const committed = orders.filter(r => ['approved', 'ordered', 'partially_received'].includes(r.data.status));
            const committedCents = committed.reduce((n, r) => n + total(r), 0), receivedCents = orders.filter(r => r.data.status === 'received').reduce((n, r) => n + total(r), 0);
            ensure(Number.isSafeInteger(committedCents) && Number.isSafeInteger(receivedCents), 'Purchasing total exceeds supported bounds');
            return { currency: ctx.config.currency, committedCents, receivedCents, outstandingOrderCount: committed.length, outstandingOrders: committed.slice(0, 20).map(r => ({ number: r.key, status: r.data.status, totalCents: total(r) })), pendingStockReceipts: receipts.filter(r => r.data.stockStatus === 'pending').length, source: 'module-owned purchase orders; external and ecosystem supplier costs are not automatically consolidated', records: [] };
        } });
}
