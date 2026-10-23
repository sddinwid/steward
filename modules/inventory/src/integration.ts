import { ensure, enqueue, registerIntegrationRoutes, object, text, lines, type Context, type Data, type Definition } from '@steward/business-kit';
import { Ajv } from 'ajv';
import type pg from 'pg';
import type { FastifyInstance } from 'fastify';
import type { ModulePackageManifest } from '@steward/module-sdk';
const validLines = new Ajv().compile(object({ lines: lines(false) }));
export async function replenish(ctx: Context) {
    if (!ctx.config.integrationsEnabled)
        return;
    const low = (await ctx.db.query('SELECT item_id,sku,quantity-reserved_quantity AS available,min_stock,replenishment_pending FROM inventory_items WHERE min_stock>0 ORDER BY sku FOR UPDATE')).rows;
    for (const item of low) {
        const below = Number(item.available) < Number(item.min_stock);
        if (below && !item.replenishment_pending) {
            const qty = Math.ceil(Number(item.min_stock) - Number(item.available));
            ensure(qty <= 100000000, 'Replenishment amount exceeds integration bounds');
            await enqueue(ctx, 'cee.procurement', 'stock.replenishment', item.item_id, { itemId: item.item_id, sku: item.sku, quantity: qty });
            await ctx.db.query('UPDATE inventory_items SET replenishment_pending=true WHERE item_id=$1', [item.item_id]);
        }
        if (!below && item.replenishment_pending)
            await ctx.db.query('UPDATE inventory_items SET replenishment_pending=false WHERE item_id=$1', [item.item_id]);
    }
}
export function inventoryDefinition(manifest: ModulePackageManifest): Definition {
    return { manifest, resources: [], actions: [], receive: async (command, ctx) => {
            const b = command.payload;
            if (command.command === 'stock.release') {
                ensure(command.sourceModuleId === 'cee.sales' && b.orderId === command.aggregateId, 'Invalid reservation identity', 403);
                const existing = (await ctx.db.query('SELECT * FROM inventory_reservations WHERE source_module=$1 AND order_id=$2 ORDER BY sku FOR UPDATE', [command.sourceModuleId, b.orderId])).rows;
                for (const row of existing) {
                    await ctx.db.query('UPDATE inventory_items SET reserved_quantity=reserved_quantity-$2,revision=revision+1,updated_at=now() WHERE sku=$1', [row.sku, row.quantity]);
                }
                await ctx.db.query('UPDATE inventory_reservations SET quantity=0 WHERE source_module=$1 AND order_id=$2', [command.sourceModuleId, b.orderId]);
                await replenish(ctx);
                return { released: true, orderId: b.orderId };
            }
            ensure(validLines({ lines: b.lines }), 'Invalid stock movement lines');
            const movements = b.lines as Data[];
            ensure(new Set(movements.map(l => l.sku)).size === movements.length, 'Repeated SKU in movement');
            const sorted = [...movements].sort((a, b) => a.sku.localeCompare(b.sku));
            const stock = new Map<string, Data>();
            for (const line of sorted) {
                const r = (await ctx.db.query('SELECT * FROM inventory_items WHERE sku=$1 FOR UPDATE', [line.sku])).rows[0];
                ensure(r, 'Inventory SKU does not exist: ' + line.sku);
                stock.set(line.sku, r);
            }
            if (command.command === 'goods.received') {
                ensure(command.sourceModuleId === 'cee.procurement' && b.receiptId === command.aggregateId && typeof b.orderNumber === 'string', 'Invalid purchase receipt identity', 403);
                for (const line of sorted)
                    await ctx.db.query('UPDATE inventory_items SET quantity=quantity+$2,revision=revision+1,updated_at=now() WHERE sku=$1', [line.sku, line.quantity]);
                await ctx.db.query('INSERT INTO inventory_movements(command_id,source_module,source_reference,movement,lines) VALUES($1,$2,$3,$4,$5)', [command.commandId, command.sourceModuleId, b.receiptId, 'receipt', JSON.stringify(sorted)]);
                await replenish(ctx);
                return { receiptId: b.receiptId, applied: true };
            }
            ensure(command.sourceModuleId === 'cee.sales' && b.orderId === command.aggregateId, 'Invalid sales order identity', 403);
            if (command.command === 'stock.reserve') {
                ensure(!(await ctx.db.query('SELECT 1 FROM inventory_reservations WHERE source_module=$1 AND order_id=$2 LIMIT 1', [command.sourceModuleId, b.orderId])).rowCount, 'Order already has an authoritative reservation', 409);
                const result = [];
                for (const line of sorted) {
                    const item = stock.get(line.sku)!;
                    const available = Math.floor(Number(item.quantity) - Number(item.reserved_quantity));
                    const reserved = Math.min(available, line.quantity);
                    await ctx.db.query('INSERT INTO inventory_reservations(source_module,order_id,sku,quantity) VALUES($1,$2,$3,$4)', [command.sourceModuleId, b.orderId, line.sku, reserved]);
                    await ctx.db.query('UPDATE inventory_items SET reserved_quantity=reserved_quantity+$2,revision=revision+1,updated_at=now() WHERE sku=$1', [line.sku, reserved]);
                    result.push({ sku: line.sku, requested: line.quantity, availableBefore: available, reserved });
                }
                await replenish(ctx);
                return { orderId: b.orderId, lines: result };
            }
            ensure(command.command === 'stock.consume', 'Unsupported stock command', 403);
            ensure(typeof b.fulfillmentId === 'string' && /^[0-9a-f-]{36}$/i.test(b.fulfillmentId), 'Invalid fulfillment reference');
            for (const line of sorted) {
                const reservation = (await ctx.db.query('SELECT quantity FROM inventory_reservations WHERE source_module=$1 AND order_id=$2 AND sku=$3 FOR UPDATE', [command.sourceModuleId, b.orderId, line.sku])).rows[0];
                ensure(reservation && Number(reservation.quantity) >= line.quantity, 'Consumption exceeds the authoritative reservation', 409);
            }
            for (const line of sorted) {
                await ctx.db.query('UPDATE inventory_reservations SET quantity=quantity-$4 WHERE source_module=$1 AND order_id=$2 AND sku=$3', [command.sourceModuleId, b.orderId, line.sku, line.quantity]);
                await ctx.db.query('UPDATE inventory_items SET quantity=quantity-$2,reserved_quantity=reserved_quantity-$2,revision=revision+1,updated_at=now() WHERE sku=$1', [line.sku, line.quantity]);
            }
            await ctx.db.query('INSERT INTO inventory_movements(command_id,source_module,source_reference,movement,lines) VALUES($1,$2,$3,$4,$5)', [command.commandId, command.sourceModuleId, String(b.fulfillmentId), 'fulfillment', JSON.stringify(sorted)]);
            await replenish(ctx);
            return { orderId: b.orderId, fulfillmentId: b.fulfillmentId, applied: true };
        } };
}
export function attachInventoryIntegration(app: FastifyInstance, pool: pg.Pool, runtime: Data, manifest: ModulePackageManifest) {
    registerIntegrationRoutes(app, pool, runtime, inventoryDefinition(manifest));
    app.get('/integration-status', async () => ({ records: (await pool.query("SELECT command_id AS id,envelope->>'command' AS command,status,attempts,last_error AS error FROM integration_outbox ORDER BY created_at DESC LIMIT 20")).rows }));
}
