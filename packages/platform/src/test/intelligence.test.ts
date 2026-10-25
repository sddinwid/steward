import {test} from 'node:test';
import assert from 'node:assert/strict';
import {investigationSummary} from '../intelligence.js';
test('catalog retains distinct currencies and deterministic impact without manufacturing confidence',()=>{
 const a=(currency:string,n:number)=>({affectedEntities:['a','b'],supportingReferences:[{id:'source'}],calculation:{capabilityId:'steward.resource-sharing',currency,horizonMonths:12,proposal:{ecosystemMonthlyBenefit:n,ecosystemHorizonBenefit:n*12}}});
 const s=investigationSummary({status:'completed',prompt:'long '.repeat(500),result:{narrative:'Conditional opportunity',analyses:[a('USD',900),a('EUR',800)]}});
 assert.equal(s.title,'Capacity sharing opportunity');assert.deepEqual(s.impacts.map((i:any)=>[i.amount,i.currency]),[[900,'USD'],[800,'EUR']]);assert.deepEqual(s.affectedEntities,['a','b']);assert.equal(s.evidenceCount,2);assert.equal('confidence' in s,false);
});
test('failed investigation is explicit and unknown impact is not zero',()=>{
 const s=investigationSummary({status:'failed',prompt:'x'.repeat(4000),error_code:'MODEL_NOT_CONFIGURED'});
 assert(s.title.length<=85);assert.equal(s.impacts.length,0);assert.match(s.summary,/No final recommendation/);assert.equal(s.findingCount,0);
});


test('synthetic purchasing impact uses exact retained cents with a cohort period and never invents recurring savings',()=>{
 const s=investigationSummary({status:'completed',result:{analyses:[{calculation:{capabilityId:'steward.simulation-purchasing',ecosystemBenefitCents:9200,currency:'USD',assumptions:['Counterfactual synthetic quotes only']},affectedEntities:['a','b'],supportingReferences:[{streamId:'simulation_runs',recordId:'source'}]}]}});
 assert.equal(s.category,'Synthetic ecosystem purchasing');assert.equal(s.impacts[0].amount,92);assert.equal(s.impacts[0].period,'counterfactual selected synthetic cohort');assert.equal(s.impacts[0].horizonMonths,null);assert.equal(s.evidenceCount,1);
});
