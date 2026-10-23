import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { calculateProcurement, calculateWorkforce, businessPage, procurementMatches, workforceMatches, formatMoneyCents } from '../business-analysis.js';
import { resourceMatches, modelToolResult } from '../analyst-context.js';
import { profileInstructions, profileTools } from '../investigation-profiles.js';
const demand = { approved: true, baselineExternal: true, sku: 'SYN-SUPPLY', unit: 'units', currency: 'EUR', quantity: 100, unitPriceCents: 1000, shippingCents: 5000, transitionCents: 2000 };
const quote = { approved: true, relationship: 'external', sku: 'SYN-SUPPLY', unit: 'units', currency: 'EUR', minimumQuantity: 150, unitPriceCents: 800, shippingCents: 6000, validUntil: '2099-01-01T00:00:00Z' };
const supply = { approved: true, skillCode: 'SYN-SKILL', availablePeople: 5, completions: 4, minimumGroupSize: 3, synthetic: true };
const program = { approved: true, programCode: 'SYN-TRAINING', skillCode: 'SYN-SKILL', remainingSeats: 10, completed: 4, minimumGroupSize: 3, synthetic: true };
const job = { approved: true, positionCode: 'SYN-JOB', requiredSkills: ['SYN-SKILL'], openings: 7, synthetic: true };
function row(stream: string, payload: any, entityId = randomUUID(), moduleId = 'example.module') { return { record_id: randomUUID(), revision: 1, stream_id: stream, entity_id: entityId, module_id: moduleId, installation_id: randomUUID(), source_at: new Date().toISOString(), payload }; }
test('Shared procurement uses exact cents, both quantities, shipping and transition once; internal transfers cancel', () => {
    const r = calculateProcurement(demand, { ...demand, quantity: 200 }, quote);
    assert.equal(r.totalQuantity, 300);
    assert.equal(r.baseline.externalCents, 310000);
    assert.equal(r.proposal.externalCents, 246000);
    assert.equal(r.proposal.transitionCents, 4000);
    assert.equal(r.proposal.ecosystemSavingsCents, 60000);
    assert.equal(calculateProcurement(demand, { ...demand, quantity: 200 }, quote, 99999).proposal.ecosystemSavingsCents, 60000);
    assert(calculateProcurement(demand, demand, { ...quote, unitPriceCents: 2000 }).proposal.ecosystemSavingsCents < 0);
    for (const changed of [{ currency: 'USD' }, { relationship: 'ecosystem' }, { minimumQuantity: 1000 }, { validUntil: '2000-01-01T00:00:00Z' }])
        assert.throws(() => calculateProcurement(demand, demand, { ...quote, ...changed }));
    assert.throws(() => calculateProcurement({ ...demand, quantity: 1e8, unitPriceCents: 1e12 }, demand, quote));
    assert.equal(formatMoneyCents(352000, 'EUR'), 'EUR 3520.00');
    assert.equal(formatMoneyCents(-1, 'EUR'), 'EUR -0.01');
    assert.equal(formatMoneyCents(1, 'EUR'), 'EUR 0.01');
    assert.equal(r.displayAmounts.ecosystemSavings, 'EUR 600.00');
    const full = { structuredContent: { data: { calculation: r, supportingReferences: [{ recordId: 'proof' }], affectedEntities: [], observed: { sources: [] } } } }, original = JSON.stringify(full), compact = modelToolResult('analyze_shared_procurement_by_id', full, true);
    assert.equal(JSON.stringify(full), original);
    assert(!Object.hasOwn(compact.structuredContent.data.calculation, 'proposal'));
    assert.equal(compact.structuredContent.data.calculation.displayAmounts.baselineExternal, 'EUR 3100.00');
});
test('Canonical procurement matching preserves references, entity boundaries, approved status and safe field selection', () => {
    const a = row('procurement_demands', { projection: demand }), b = row('procurement_demands', { projection: demand }), q = row('procurement_quotes', { projection: quote }, a.entity_id);
    assert.equal(procurementMatches([a, b, q], {}).matches.length, 1);
    assert.equal(procurementMatches([a, { ...b, entity_id: a.entity_id }, q], {}).matches.length, 0);
    assert.equal(procurementMatches([a, b, { ...q, entity_id: randomUUID() }], {}).matches.length, 0);
    const selected = businessPage([a, b, q], { entityId: a.entity_id, category: 'procurement-demand', fields: ['quantity', 'currency'], limit: 1 });
    assert.equal(selected.records.length, 1);
    assert.equal(selected.records[0]?.entityId, a.entity_id);
    assert(!Object.hasOwn(selected.records[0]!, 'sku'));
    assert.throws(() => businessPage([a], { category: 'procurement-demand', fields: ['privateKey'] }));
    assert.equal(procurementMatches([a, b, { ...q, payload: { projection: { ...quote, approved: false } } }], {}).total, 0);
});
test('Aggregate workforce calculations preserve suppression and do not add overlapping completions or invent qualification', () => {
    const r = calculateWorkforce(supply, program, job);
    assert.equal(r.potentialQualifiedCoverage, 5);
    assert.equal(r.remainingSkillGap, 2);
    assert.equal(r.qualifiedCompletions, 4);
    assert.equal(r.trainingSeats, 10);
    assert.equal(r.decisionExecuted, false);
    const suppressed = calculateWorkforce({ ...supply, availablePeople: null, completions: null }, { ...program, completed: null }, job);
    assert.equal(suppressed.potentialQualifiedCoverage, null);
    assert.equal(suppressed.remainingSkillGap, null);
    assert.equal(calculateWorkforce(supply, program, { ...job, requiredSkills: ['SYN-SKILL', 'OTHER'] }).potentialQualifiedCoverage, null);
    assert.equal(calculateWorkforce(supply,{...program,endsAt:'2000-01-01T00:00:00Z'},job).trainingSeats,0);
    assert.throws(() => calculateWorkforce({ ...supply, availablePeople: 1 }, program, job));
    assert.throws(() => calculateWorkforce(supply, { ...program, skillCode: 'OTHER' }, job));
    assert.throws(() => calculateWorkforce({ ...supply, approved: false }, program, job));
});
test('Workforce evidence joins only authorized aggregate schemas and excludes withdrawn projections', () => {
    const s = row('workforce_supply', { projection: supply }), p = row('training_metrics', { projection: program }, s.entity_id), d = row('workforce_demand', { projection: job });
    assert.equal(workforceMatches([s, p, d], {}).total, 1);
    assert.equal(workforceMatches([s, { ...p, entity_id: d.entity_id }, d], {}).total, 0);
    assert.equal(businessPage([{ ...d, payload: { projection: { ...job, approved: false } } }], { category: 'workforce-demand' }).total, 0);
    assert(!JSON.stringify(workforceMatches([s, p, d], {})).includes('candidateReference'));
});
test('Resource sharing accepts compatible canonical projections from separate modules and rejects expired capacity', () => {
    const s = row('capacities', { name: 'Warehouse', site: 'North', available_m3: 100, currency: 'EUR' }, undefined, 'example.assets'), d = row('storage_requirements', { name: 'Demand', site: 'North', required_m3: 50, monthly_external_cost: 1000, currency: 'EUR' }, undefined, 'example.operations');
    assert.equal(resourceMatches([s, d], {}).total, 1);
    assert.equal(resourceMatches([{ ...s, payload: { ...s.payload, valid_until: '2000-01-01T00:00:00Z' } }, d], {}).total, 0);
    assert(profileInstructions('shared-procurement')?.includes('VERBATIM'));
    assert(profileTools['workforce-opportunity'].includes('analyze_workforce_opportunity_by_id'));
    assert.equal(profileInstructions('resource-sharing'), undefined);
});
