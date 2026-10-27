// Independent financial examples and hostile boundary inputs. No provider writes,
// fixtures, installation authority or accepted Sales repricing are involved.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {calculateContribution,compareContribution} from '../packages/catalog-kit/dist/contribution.js';
import {costOptionId,costObservationDigest} from '../packages/catalog-kit/dist/cost-evidence.js';
import {makeUnitDefinition} from '../packages/catalog-kit/dist/operational.js';

const owner=randomUUID(),worker=randomUUID(),installation=randomUUID(),at='2026-10-27T12:00:00.000Z';
const unit=makeUnitDefinition('item',0),subject={kind:'sku',sku:'ORACLE-ITEM'};
const provider={contractVersion:1,entityId:owner,workerInstallationId:worker,moduleId:'cee.procurement',moduleInstallationId:installation,packageDigest:'a'.repeat(64)};
const money=(n,currency='USD')=>({contractVersion:1,amountCents:n,currency,scale:2});
function evidence(category,amount,chargeBasis='per-unit',patch={}){
 const source={contractVersion:1,entityId:owner,moduleId:provider.moduleId,streamId:'procurement_cost_quotes_v1',recordId:randomUUID(),revision:1,provider,observedAt:at};
 const o={contractVersion:1,optionId:costOptionId(source,category),name:'Explicit supplier evidence',category,amount:money(amount),basis:'estimate',chargeBasis,basisQuantity:1,unitDefinition:unit,minimumQuantity:1,maximumQuantity:null,exactQuantity:null,source,origin:{kind:'supplier-quote',mode:null,originDigest:null,connectionId:null,accountId:null,productId:null,externalVariantId:null,supplierRecordId:randomUUID()},sourceCode:'SOURCE-ITEM',observedAt:at,expiresAt:'2026-10-27T13:00:00.000Z',reason:null,...patch};
 o.factsDigest=costObservationDigest(o);
 return{contractVersion:1,component:{contractVersion:1,id:randomUUID(),description:'Explicit original cost binding',subject,category:o.category,amount:o.amount,basis:o.basis,source:o.source,observedAt:o.observedAt},observation:o};
}
function input(patch={}){return{contractVersion:1,ownerEntityId:owner,subject,quantity:7,unitDefinition:unit,unitPrice:money(300),acquisitionMode:'supplier',requiredCategories:['supplier','fulfillment'],evidence:[evidence('supplier',125),evidence('fulfillment',225,'per-order')],notApplicable:[],shipmentCount:null,evaluatedAt:at,...patch};}
function incomplete(i){const r=calculateContribution(i);assert.notEqual(r.status,'complete');assert.equal(r.totalVariableCostCents,null);assert.equal(r.contributionCents,null);assert.equal(r.contributionBasisPoints,null);return r;}

test('independent seven-item example charges shipping once and retains exact fraction',()=>{
 const r=calculateContribution(input());
 assert.equal(r.revenueCents,2100);assert.equal(r.knownCostSubtotalCents,1100);assert.equal(r.contributionCents,1000);
 assert.equal(r.contributionBasisPoints,4761);assert.deepEqual(r.percentageFraction,{numeratorCents:1000,denominatorCents:2100});
 assert.equal(r.costBasis,'estimated');assert.equal(r.actualContribution,null);assert.equal(r.decisionExecuted,false);
 const c=compareContribution(input(),[money(350),money(250)]);
 assert.deepEqual(c.scenarios.map(s=>s.contributionDeltaCents),[350,-350]);
 assert.deepEqual(c.scenarios.map(s=>s.result.totalVariableCostCents),[1100,1100]);
});

test('negative contribution rounds signed basis points down; zero revenue has no percentage',()=>{
 const r=calculateContribution(input({quantity:1,unitPrice:money(300),requiredCategories:['supplier'],evidence:[evidence('supplier',301)]}));
 assert.equal(r.contributionCents,-1);assert.equal(r.contributionBasisPoints,-34);
 const z=calculateContribution(input({quantity:1,unitPrice:money(0),requiredCategories:['supplier'],evidence:[evidence('supplier',1)]}));
 assert.equal(z.contributionCents,-1);assert.equal(z.contributionBasisPoints,null);assert.equal(z.percentageFraction,null);
});

test('missing packaging preserves a useful known subtotal without inventing total costs',()=>{
 const r=incomplete(input({requiredCategories:['supplier','fulfillment','packaging']}));
 assert.equal(r.knownCostSubtotalCents,1100);assert.deepEqual(r.missingRequiredCosts,['packaging']);
});

test('quoted MOQ and foreign currency cannot become applicable by matching names or SKUs',()=>{
 const q=incomplete(input({evidence:[evidence('supplier',125,'per-unit',{minimumQuantity:10}),evidence('fulfillment',225,'per-order')]}));
 assert.equal(q.knownCostSubtotalCents,225);assert.equal(q.slots.find(s=>s.category==='supplier').status,'quantity_mismatch');
 const c=incomplete(input({evidence:[evidence('supplier',125,'per-unit',{amount:money(125,'EUR')}),evidence('fulfillment',225,'per-order')]}));
 assert.equal(c.slots.find(s=>s.category==='supplier').status,'currency_mismatch');
});

test('lease expiry is exclusive and future evidence never becomes fresh through a backdated scenario',()=>{
 incomplete(input({evaluatedAt:'2026-10-27T13:00:00.000Z'}));
 incomplete(input({evaluatedAt:'2026-10-27T11:59:59.999Z'}));
 assert.equal(calculateContribution(input({evaluatedAt:'2026-10-27T12:59:59.999Z'})).status,'complete');
});

test('same unit label with different scale is not an authorized conversion',()=>{
 const r=incomplete(input({evidence:[evidence('supplier',125,'per-unit',{unitDefinition:makeUnitDefinition('item',3)}),evidence('fulfillment',225,'per-order')]}));
 assert.equal(r.slots.find(s=>s.category==='supplier').status,'unit_mismatch');
 assert.throws(()=>calculateContribution(input({unitDefinition:makeUnitDefinition('item',3)})),/UNIT|SCALE|QUANTITY/);
});

test('per-order quotes still require their declared quantity unit to match the scenario',()=>{
 const r=incomplete(input({evidence:[evidence('supplier',125),evidence('fulfillment',225,'per-order',{unitDefinition:makeUnitDefinition('kilogram',0)})]}));
 assert.equal(r.slots.find(s=>s.category==='fulfillment').status,'unit_mismatch');
});

test('shipment fees require an explicit count and supplier/production acquisition cannot double count',()=>{
 const i=input({evidence:[evidence('supplier',125),evidence('fulfillment',100,'per-shipment')]});incomplete(i);
 assert.equal(calculateContribution({...i,shipmentCount:2}).totalVariableCostCents,1075);
 assert.throws(()=>calculateContribution(input({requiredCategories:['supplier','production']})),/DOUBLE_COUNT/);
 const duplicate=input();duplicate.evidence.push(structuredClone(duplicate.evidence[0]));
 assert.equal(incomplete(duplicate).status,'conflict');
});

test('exact money boundaries reject overflowing multiplication instead of rounding or clamping',()=>{
 const edge=calculateContribution(input({quantity:1,unitPrice:money(1000000000000),requiredCategories:['supplier'],evidence:[evidence('supplier',1000000000000)]}));
 assert.equal(edge.contributionCents,0);assert.equal(edge.revenueCents,1000000000000);
 assert.throws(()=>calculateContribution(input({quantity:2,unitPrice:money(1000000000000)})),/OVERFLOW/);
 assert.throws(()=>calculateContribution(input({quantity:2,evidence:[evidence('supplier',1000000000000),evidence('fulfillment',225,'per-order')]})),/OVERFLOW/);
});

test('re-digesting another source namespace does not manufacture cost authority',()=>{
 const e=evidence('supplier',125);e.observation.source.streamId='commerce_orders';e.observation.factsDigest=costObservationDigest(e.observation);
 assert.throws(()=>calculateContribution(input({evidence:[e]})),/SOURCE|STREAM|ORIGIN/);
});

test('foreign Catalog ownership cannot be laundered through locally owned cost evidence',()=>{
 const foreign={kind:'catalog',offeringId:randomUUID(),variantId:null,offeringRevision:1,variantRevision:null,provider:{...provider,moduleId:'steward.catalog.universal',entityId:randomUUID()}};
 const i=input({subject:foreign});for(const e of i.evidence)e.component.subject=foreign;
 assert.throws(()=>calculateContribution(i),/OWNER|ENTITY|SUBJECT/);
});

test('an impossible calendar date is rejected rather than silently normalized',()=>{
 assert.throws(()=>calculateContribution(input({evaluatedAt:'2026-02-30T12:00:00.000Z'})),/TIME|DATE|INPUT/);
});

test('explicit service nonapplicability is an expiring human assumption, never a recorded expense',()=>{
 const p={...provider,moduleId:'steward.pricing.management'};
 const review={contractVersion:1,category:'supplier',actorId:randomUUID(),reason:'Service is delivered from existing internal capacity; this scenario assumes no incremental acquisition charge.',source:{contractVersion:1,entityId:owner,moduleId:p.moduleId,streamId:'pricing_cost_assessments_v1',recordId:randomUUID(),revision:1,provider:p,observedAt:at},observedAt:at,expiresAt:'2026-10-27T13:00:00.000Z'};
 const i=input({requiredCategories:['supplier'],evidence:[],notApplicable:[review]});
 const r=calculateContribution(i);assert.equal(r.status,'complete');assert.equal(r.slots[0].status,'not_applicable');assert.equal(r.slots[0].reason,review.reason);
 assert.equal(r.costBasis,'estimated');assert.equal(r.actualContribution,null);
 incomplete({...i,evaluatedAt:review.expiresAt});
});
