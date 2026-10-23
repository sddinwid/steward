import { z } from 'zod';
import type { BusinessEvidenceCategory, SourceReference } from '@steward/contracts';
import { fail } from './security/crypto.js';
const integer = z.number().int().min(0).max(1e12), positive = z.number().int().min(1).max(1e8), currency = z.string().regex(/^[A-Z]{3}$/);
const demandSchema = z.object({ approved: z.literal(true), sku: z.string().min(1).max(80), unit: z.string().min(1).max(40), currency, quantity: positive, unitPriceCents: integer, shippingCents: integer, transitionCents: integer, baselineExternal: z.literal(true) });
const quoteSchema = z.object({ approved: z.literal(true), sku: z.string().min(1).max(80), unit: z.string().min(1).max(40), currency, minimumQuantity: positive, unitPriceCents: integer, shippingCents: integer, relationship: z.literal('external'), validUntil: z.string().datetime() });
const supplySchema = z.object({ approved: z.literal(true), skillCode: z.string().min(1).max(60), availablePeople: integer.nullable(), completions: integer.nullable(), minimumGroupSize: z.number().int().min(3), synthetic: z.literal(true) });
const trainingSchema = z.object({ approved: z.literal(true), programCode: z.string(), skillCode: z.string(), remainingSeats: integer, completed: integer.nullable(), minimumGroupSize: z.number().int().min(3), synthetic: z.literal(true),endsAt:z.string().datetime().optional() });
const remainingTrainingSeats=(p:{remainingSeats:number;endsAt?:string|undefined})=>p.endsAt&&Date.parse(p.endsAt)<=Date.now()?0:p.remainingSeats;
const jobSchema = z.object({ approved: z.literal(true), positionCode: z.string(), requiredSkills: z.array(z.string()).min(1).max(30), openings: integer, synthetic: z.literal(true) });
export const canonicalBusinessPayload = (row: any) => row.payload?.projection ?? row.payload;
export const sourceReference = (r: any): SourceReference => ({ entityId: r.entity_id, moduleId: r.module_id, streamId: r.stream_id, recordId: r.record_id, revision: Number(r.revision) });
const fresh = (r: any) => !r.payload?.valid_until || Date.parse(r.payload.valid_until) > Date.now();
const safe = (value: number) => { if (!Number.isSafeInteger(value))
    fail(422, 'Calculation exceeds exact integer bounds'); return value; };
export function formatMoneyCents(value: number, currency: string) { safe(value); const n = BigInt(value), absolute = n < 0n ? -n : n; return currency + ' ' + (n < 0n ? '-' : '') + (absolute / 100n).toString() + '.' + (absolute % 100n).toString().padStart(2, '0'); }
const streams: Record<BusinessEvidenceCategory, string> = { 'procurement-demand': 'procurement_demands', 'procurement-quote': 'procurement_quotes', 'purchase-commitment': 'purchase_commitments', 'sales-demand': 'sales_demand', 'replenishment': 'replenishment_requirements', 'workforce-supply': 'workforce_supply', training: 'training_metrics', 'workforce-demand': 'workforce_demand' };
export const businessQuerySchema = z.object({ entityId: z.string().uuid().optional(), category: z.enum(Object.keys(streams) as [
        BusinessEvidenceCategory,
        ...BusinessEvidenceCategory[]
    ]), fields: z.array(z.string().min(1).max(50)).max(15).optional(), limit: z.number().int().min(1).max(20).default(3), offset: z.number().int().min(0).max(100000).default(0) }).strict();
const fields: Record<BusinessEvidenceCategory, string[]> = {
    'procurement-demand': ['number', 'sku', 'unit', 'quantity', 'currency', 'unitPriceCents', 'shippingCents', 'transitionCents', 'approved', 'baselineExternal'],
    'procurement-quote': ['number', 'sku', 'unit', 'currency', 'minimumQuantity', 'unitPriceCents', 'shippingCents', 'relationship', 'validUntil', 'approved'],
    'purchase-commitment': ['number', 'supplierCode', 'currency', 'lines', 'shippingCents', 'status', 'received'],
    'sales-demand': ['number', 'currency', 'lines', 'status', 'stockStatus', 'reserved', 'fulfilled'],
    replenishment: ['sku', 'quantity', 'itemId', 'status'],
    'workforce-supply': ['skillCode', 'availablePeople', 'completions', 'minimumGroupSize', 'suppressed', 'synthetic'],
    training: ['programCode', 'name', 'skillCode', 'site', 'seats', 'remainingSeats', 'completed', 'startsAt', 'endsAt', 'synthetic', 'minimumGroupSize'],
    'workforce-demand': ['positionCode', 'title', 'requiredSkills', 'openings', 'site', 'synthetic']
};
function view(row: any, keys: string[]) { const p = canonicalBusinessPayload(row); return { ...sourceReference(row), sourceWorker: row.installation_id, observedAt: row.source_at, ...Object.fromEntries(keys.filter(k => p[k] !== undefined).map(k => [k, p[k]])) }; }
export function businessPage(records: any[], raw: unknown) { const q = businessQuerySchema.parse(raw); if (q.fields?.some(f => !fields[q.category].includes(f)))
    fail(400, 'Unknown canonical field'); const rows = records.filter(r => r.stream_id === streams[q.category] && canonicalBusinessPayload(r).approved !== false && (!q.entityId || r.entity_id === q.entityId) && fresh(r)).sort((a, b) => a.record_id.localeCompare(b.record_id)); return { records: rows.slice(q.offset, q.offset + q.limit).map(r => view(r, q.fields ?? fields[q.category])), total: rows.length, nextOffset: q.offset + q.limit < rows.length ? q.offset + q.limit : null, authoritative: false }; }
export const businessMatchSchema = z.object({ entityId: z.string().uuid().optional(), limit: z.number().int().min(1).max(10).default(1), offset: z.number().int().min(0).max(100000).default(0) }).strict();
function valid(records: any[], stream: string, schema: z.ZodType) { return records.filter(r => r.stream_id === stream && schema.safeParse(canonicalBusinessPayload(r)).success && fresh(r)); }
function checkBounds(records: any[], combinations: number) { if (records.length > 10000 || combinations > 1000000)
    fail(413, 'Narrow the business evidence scope'); }
export function procurementMatches(records: any[], raw: unknown) {
    const q = businessMatchSchema.parse(raw), demands = valid(records, 'procurement_demands', demandSchema), quotes = valid(records, 'procurement_quotes', quoteSchema).filter(r => Date.parse(canonicalBusinessPayload(r).validUntil) > Date.now());
    checkBounds(records, demands.length * demands.length * quotes.length);
    const candidates = [];
    for (let a = 0; a < demands.length; a++)
        for (let b = a + 1; b < demands.length; b++)
            for (const quote of quotes) {
                const first = demands[a]!, second = demands[b]!, x = canonicalBusinessPayload(first), y = canonicalBusinessPayload(second), p = canonicalBusinessPayload(quote);
                if (first.entity_id !== second.entity_id && [first.entity_id, second.entity_id].includes(quote.entity_id) && x.sku === y.sku && x.sku === p.sku && x.unit === y.unit && x.unit === p.unit && x.currency === y.currency && x.currency === p.currency && x.quantity + y.quantity >= p.minimumQuantity && (!q.entityId || [first.entity_id, second.entity_id, quote.entity_id].includes(q.entityId)))
                    candidates.push({ first, second, quote });
            }
    candidates.sort((a, b) => a.first.record_id.localeCompare(b.first.record_id) || a.second.record_id.localeCompare(b.second.record_id) || a.quote.record_id.localeCompare(b.quote.record_id));
    return { matches: candidates.slice(q.offset, q.offset + q.limit).map(m => ({ first: view(m.first, fields['procurement-demand']), second: view(m.second, fields['procurement-demand']), quote: view(m.quote, fields['procurement-quote']) })), total: candidates.length, nextOffset: q.offset + q.limit < candidates.length ? q.offset + q.limit : null, authoritative: false, notice: 'Evidence screening only. Invoke the deterministic calculation before claiming savings.' };
}
export function calculateProcurement(firstRaw: unknown, secondRaw: unknown, quoteRaw: unknown, internalTransferCents = 0) {
    const a = demandSchema.parse(firstRaw), b = demandSchema.parse(secondRaw), q = quoteSchema.parse(quoteRaw);
    integer.parse(internalTransferCents);
    if (a.sku !== b.sku || a.sku !== q.sku || a.unit !== b.unit || a.unit !== q.unit || a.currency !== b.currency || a.currency !== q.currency || Date.parse(q.validUntil) <= Date.now())
        fail(422, 'Incompatible or expired procurement evidence');
    const totalQuantity = safe(a.quantity + b.quantity);
    if (totalQuantity < q.minimumQuantity)
        fail(422, 'Combined demand does not meet quoted minimum');
    const baselineExternalCents = safe(safe(a.quantity * a.unitPriceCents) + a.shippingCents + safe(b.quantity * b.unitPriceCents) + b.shippingCents);
    const proposalExternalCents = safe(safe(totalQuantity * q.unitPriceCents) + q.shippingCents), transitionCents = safe(a.transitionCents + b.transitionCents), ecosystemCostCents = safe(proposalExternalCents + transitionCents);
    const ecosystemSavingsCents = safe(baselineExternalCents - ecosystemCostCents);
    return { capabilityId: 'steward.shared-procurement', schemaVersion: 1, currency: a.currency, sku: a.sku, unit: a.unit, totalQuantity, baseline: { externalCents: baselineExternalCents }, proposal: { externalCents: proposalExternalCents, transitionCents, ecosystemCostCents, ecosystemSavingsCents }, displayAmounts: { baselineExternal: formatMoneyCents(baselineExternalCents, a.currency), proposedExternal: formatMoneyCents(proposalExternalCents, a.currency), transitionExpense: formatMoneyCents(transitionCents, a.currency), proposedEcosystemCost: formatMoneyCents(ecosystemCostCents, a.currency), ecosystemSavings: formatMoneyCents(ecosystemSavingsCents, a.currency), internalTransfer: formatMoneyCents(internalTransferCents, a.currency), unit: 'Major currency units; formatted exactly by Steward from integer cents' }, assumptions: { internalTransferCents, internalTransfersCancel: true, baseline: 'Each approved demand uses its observed external unit price and shipping once', proposal: 'One external supplier quote, one combined shipping charge and each approved transition expense once' }, uncertainties: ['Confirm supplier quote validity, delivery terms, specifications, taxes, allocation and human purchasing approval.', 'Internal transfers redistribute costs between entities and are excluded from new ecosystem revenue.'], decisionExecuted: false };
}
export function workforceMatches(records: any[], raw: unknown) {
    const q = businessMatchSchema.parse(raw), supplies = valid(records, 'workforce_supply', supplySchema), training = valid(records, 'training_metrics', trainingSchema), jobs = valid(records, 'workforce_demand', jobSchema);
    checkBounds(records, supplies.length * training.length * jobs.length);
    const candidates = [];
    for (const supply of supplies)
        for (const program of training)
            for (const demand of jobs) {
                const s = canonicalBusinessPayload(supply), p = canonicalBusinessPayload(program), d = canonicalBusinessPayload(demand);
                if (supply.entity_id === program.entity_id && supply.entity_id !== demand.entity_id && s.skillCode === p.skillCode && d.requiredSkills.includes(s.skillCode) && d.openings > 0 && (s.availablePeople !== null && s.availablePeople > 0 || remainingTrainingSeats(p) > 0) && (!q.entityId || [supply.entity_id, demand.entity_id].includes(q.entityId)))
                    candidates.push({ supply, program, demand });
            }
    candidates.sort((a, b) => a.supply.record_id.localeCompare(b.supply.record_id) || a.demand.record_id.localeCompare(b.demand.record_id) || a.program.record_id.localeCompare(b.program.record_id));
    return { matches: candidates.slice(q.offset, q.offset + q.limit).map(m => ({ supply: view(m.supply, fields['workforce-supply']), program: view(m.program, fields.training), demand: view(m.demand, fields['workforce-demand']) })), total: candidates.length, nextOffset: q.offset + q.limit < candidates.length ? q.offset + q.limit : null, authoritative: false, notice: 'Aggregates only; suppressed groups are unknown. No individuals or hiring decisions are disclosed.' };
}
export function calculateWorkforce(supplyRaw: unknown, programRaw: unknown, demandRaw: unknown) {
    const s = supplySchema.parse(supplyRaw), p = trainingSchema.parse(programRaw), d = jobSchema.parse(demandRaw);
    if (s.skillCode !== p.skillCode || !d.requiredSkills.includes(s.skillCode))
        fail(422, 'Skill evidence does not match job requirements');
    for (const value of [s.availablePeople, s.completions])
        if (value !== null && value < s.minimumGroupSize)
            fail(422, 'Unsuppressed workforce group violates privacy threshold');
    if (p.completed !== null && p.completed < p.minimumGroupSize)
        fail(422, 'Unsuppressed completion group violates privacy threshold');
    const eligible = s.availablePeople === null || d.requiredSkills.length !== 1 ? null : Math.min(s.availablePeople, d.openings);
    return { capabilityId: 'steward.workforce-opportunity', schemaVersion: 1, skillCode: s.skillCode, openings: d.openings, availablePeople: s.availablePeople, qualifiedCompletions: s.completions, trainingSeats: remainingTrainingSeats(p), potentialQualifiedCoverage: eligible, remainingSkillGap: eligible === null ? null : Math.max(0, d.openings - eligible), assumptions: { syntheticDataOnly: true, peopleAndCompletionsMayOverlap: true, countsNotAdded: true, additionalRequiredSkillsNeedReview: d.requiredSkills.filter(v => v !== s.skillCode) }, uncertainties: ['Aggregates are not candidate identities, consent, availability guarantees or hiring decisions.', 'Training capacity is potential future supply, not completed qualifications; ended programs contribute no available seats.', 'Humans must verify all skills, scheduling, access, geography, consent and employment suitability.'], humanReviewRequired: true, decisionExecuted: false };
}
