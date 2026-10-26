import {managementAuthorityResource,managementAuthorityActions,receivePropertyAuthority,auditAssetAccess,propertyProgramAuthority} from './authority.js';
import { ensure, find, save, records, publicRecord, object, text, amount, choice, type Definition, type Context, type RecordValue, type Data } from '@steward/business-kit';
import type { ModulePackageManifest } from '@steward/module-sdk';
const nonnegative = { type: 'number', minimum: 0, maximum: 100000000, multipleOf: 0.001 };
const entity = { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' };
const ownership = { ownerEntityId: entity, custodianEntityId: entity, userEntityId: entity, accessBasis: choice(['owned', 'leased', 'shared', 'custody']) };
function authorized(b: Data, ctx: Context) { ensure(ctx.config.authorizedOwnerEntityIds.includes(b.ownerEntityId), 'Owner relationship is not approved in module configuration', 403); }
async function projection(r: RecordValue, ctx: Context) {
    const d = r.data, now = Date.now(), maintenance = (await records(ctx, 'maintenance')).filter(m => m.data.assetCode === r.key && m.data.status === 'planned'), bookings = (await records(ctx, 'booking')).filter(m => m.data.assetCode === r.key && m.data.status === 'booked');
    const active = (m: RecordValue) => Date.parse(m.data.startsAt) <= now && Date.parse(m.data.endsAt) > now;
    const blocked = d.availability !== 'available' || !ctx.config.authorizedOwnerEntityIds.includes(d.ownerEntityId) || maintenance.some(active);
    const used = bookings.filter(active).reduce((n, b) => n + b.data.capacityM3, 0);
    const available = blocked ? 0 : Math.max(0, d.capacityM3 - d.utilizedM3 - used);
    const next = [...maintenance, ...bookings].flatMap(m => [Date.parse(m.data.startsAt), Date.parse(m.data.endsAt)]).filter(t => t > now).sort((a, b) => a - b)[0];
    await ctx.db.query('INSERT INTO capacities(id,revision,name,site,capacity_m3,utilized_m3,available_m3,monthly_operating_cost,currency,ownership,valid_until) VALUES($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET revision=capacities.revision+1,name=excluded.name,site=excluded.site,capacity_m3=excluded.capacity_m3,utilized_m3=excluded.utilized_m3,available_m3=excluded.available_m3,monthly_operating_cost=excluded.monthly_operating_cost,currency=excluded.currency,ownership=excluded.ownership,valid_until=excluded.valid_until WHERE (capacities.name,capacities.site,capacities.capacity_m3,capacities.utilized_m3,capacities.available_m3,capacities.monthly_operating_cost,capacities.currency,capacities.ownership,capacities.valid_until) IS DISTINCT FROM (excluded.name,excluded.site,excluded.capacity_m3,excluded.utilized_m3,excluded.available_m3,excluded.monthly_operating_cost,excluded.currency,excluded.ownership,excluded.valid_until)', [r.id, d.name, d.site, d.capacityM3, d.utilizedM3, available, d.monthlyOperatingCostCents / 100, d.currency, { ownerEntityId: d.ownerEntityId, custodianEntityId: d.custodianEntityId, userEntityId: d.userEntityId, accessBasis: d.accessBasis }, next ? new Date(next).toISOString() : null]);
}
export function assets(manifest: ModulePackageManifest): Definition {
    return { manifest, auditAccess:auditAssetAccess, receive:receivePropertyAuthority, queries:[{path:'/program-authority',run:propertyProgramAuthority}], resources: [managementAuthorityResource,
            { kind: 'facility', path: '/facilities', key: 'code', schema: object({ code: text(60), name: text(), site: text(), classification: choice(['warehouse', 'office', 'land', 'workshop', 'residential']), ...ownership }), prepare: async (b, p, ctx) => { authorized(b, ctx); return b; } },
            { kind: 'asset', path: '/assets', key: 'code', schema: object({ code: text(60), name: text(), facilityCode: text(60), site: text(), classification: choice(['warehouse', 'equipment', 'vehicle', 'office', 'residential']), ...ownership, capacityM3: nonnegative, utilizedM3: nonnegative, availability: choice(['available', 'unavailable', 'maintenance']), monthlyOperatingCostCents: amount, currency: text(3) }), prepare: async (b, p, ctx) => {
                    authorized(b, ctx);
                    ensure(await find(ctx, 'facility', b.facilityCode), 'Unknown facility');
                    ensure(b.utilizedM3 <= b.capacityM3, 'Utilization exceeds capacity');
                    ensure(b.currency === ctx.config.currency, 'Currency differs from configured currency');
                    return { ...b, status: p?.data.status ?? 'unpublished' };
                }, after: async (r, _p, ctx) => { if (r.data.status === 'published')
                    await projection(r, ctx); } },
            { kind: 'maintenance', path: '/maintenance', key: 'number', schema: object({ number: text(80), assetCode: text(60), description: text(500), startsAt: text(40), endsAt: text(40), costCents: amount }), prepare: async (b, p, ctx) => {
                    ensure(!p || p.data.status === 'planned', 'Completed maintenance is immutable');
                    ensure(await find(ctx, 'asset', b.assetCode), 'Unknown asset');
                    window(b);
                    ensure(!(await records(ctx, 'booking')).some(r => r.data.assetCode === b.assetCode && r.data.status === 'booked' && Date.parse(r.data.startsAt) < Date.parse(b.endsAt) && Date.parse(r.data.endsAt) > Date.parse(b.startsAt)), 'Maintenance overlaps a confirmed booking', 409);
                    return { ...b, status: 'planned' };
                }, after: async (r, _p, ctx) => { const a = (await find(ctx, 'asset', r.data.assetCode))!; if (a.data.status === 'published')
                    await projection(a, ctx); } },
            { kind: 'booking', path: '/bookings', key: 'number', schema: object({ number: text(80), assetCode: text(60), purpose: text(300), startsAt: text(40), endsAt: text(40), capacityM3: nonnegative }), prepare: async (b, p, ctx) => {
                    ensure(!p, 'Bookings are immutable; cancel and create a replacement');
                    window(b);
                    const asset = await find(ctx, 'asset', b.assetCode);
                    ensure(asset && asset.data.availability === 'available', 'Asset unavailable');
                    const overlaps = (r: RecordValue) => r.data.assetCode === b.assetCode && Date.parse(r.data.startsAt) < Date.parse(b.endsAt) && Date.parse(r.data.endsAt) > Date.parse(b.startsAt);
                    ensure(!(await records(ctx, 'maintenance')).some(r => r.data.status === 'planned' && overlaps(r)), 'Booking overlaps planned maintenance');
                    const used = (await records(ctx, 'booking')).filter(r => r.data.status === 'booked' && overlaps(r)).reduce((n, r) => n + r.data.capacityM3, 0);
                    ensure(used + b.capacityM3 <= asset.data.capacityM3 - asset.data.utilizedM3, 'Booking exceeds available capacity', 409);
                    return { ...b, status: 'booked' };
                }, after: async (r, _p, ctx) => { const a = (await find(ctx, 'asset', r.data.assetCode))!; if (a.data.status === 'published')
                    await projection(a, ctx); } }
        ], actions: [...managementAuthorityActions,
            { path: '/withdraw/:id', permission: 'cee.assets.publish', kind: 'asset', run: async (r, ctx) => { await ctx.db.query('UPDATE capacities SET available_m3=0,valid_until=now(),revision=revision+1 WHERE id=$1', [r.id]); return { record: publicRecord(await save(ctx, 'asset', r.key, { ...r.data, status: 'unpublished' }, r)) }; } },
            { path: '/publish/:id', permission: 'cee.assets.publish', kind: 'asset', run: async (r, ctx) => { authorized(r.data, ctx); await projection(r, ctx); return { record: publicRecord(await save(ctx, 'asset', r.key, { ...r.data, status: 'published' }, r)) }; } },
            { path: '/complete/:id', permission: 'cee.assets.maintain', kind: 'maintenance', run: async (r, ctx) => { ensure(r.data.status === 'planned', 'Maintenance already completed'); const updated = await save(ctx, 'maintenance', r.key, { ...r.data, status: 'completed' }, r); const asset = (await find(ctx, 'asset', r.data.assetCode))!; if (asset.data.status === 'published')
                    await projection(asset, ctx); return { record: publicRecord(updated) }; } },
            { path: '/cancel-booking/:id', permission: 'cee.assets.write', kind: 'booking', run: async (r, ctx) => { ensure(r.data.status === 'booked', 'Booking is not active'); const updated = await save(ctx, 'booking', r.key, { ...r.data, status: 'canceled' }, r); const a = (await find(ctx, 'asset', r.data.assetCode))!; if (a.data.status === 'published')
                    await projection(a, ctx); return { record: publicRecord(updated) }; } }
        ], tick: async (ctx) => { for (const asset of await records(ctx, 'asset'))
            if (asset.data.status === 'published')
                await projection(asset, ctx); }, report: async (ctx) => { const assets = await records(ctx, 'asset'), maintenance = await records(ctx, 'maintenance'); return { assetCount: assets.length, capacityM3: assets.reduce((n, r) => n + r.data.capacityM3, 0), utilizedM3: assets.reduce((n, r) => n + r.data.utilizedM3, 0), monthlyOperatingCostCents: assets.reduce((n, r) => n + r.data.monthlyOperatingCostCents, 0), plannedMaintenance: maintenance.filter(r => r.data.status === 'planned').length, currency: ctx.config.currency, records: [], source: 'Operational asset records; ownership and usage are separate relationships' }; } };
}
function window(b: Data) { ensure(Number.isFinite(Date.parse(b.startsAt)) && Number.isFinite(Date.parse(b.endsAt)) && Date.parse(b.startsAt) < Date.parse(b.endsAt), 'Invalid scheduling interval'); }
