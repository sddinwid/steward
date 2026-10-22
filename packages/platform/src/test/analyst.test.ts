import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resourceSharing, type SharingInput } from '../analytical-capabilities.js';
import { modelConfigSchema, createModel, tlsFetch } from '../analyst-model.js';
import { narrativeSchema } from '../analyst.js';
import { agentProof,verifyAgentProof } from '../mcp-agent-identity.js';
test('AI attribution requires a session-bound signed process proof and rejects replay and forgery',()=>{
 const proof=agentProof('test-session');verifyAgentProof(proof,'test-session');assert.throws(()=>verifyAgentProof(proof,'test-session'));
 assert.throws(()=>verifyAgentProof(agentProof('another-session'),'test-session'));
 assert.throws(()=>verifyAgentProof(agentProof('test-session')+'altered','test-session'));
 assert.throws(()=>verifyAgentProof(undefined,'test-session'));
});
const base:SharingInput={availableCapacity:1200,requiredCapacity:500,externalMonthlyCost:10000,internalMonthlyPayment:3000,incrementalMonthlyCost:1000,transitionExpense:6000,horizonMonths:12,avoidableExternalFraction:1,locationCompatible:true,currency:'EUR',sensitivity:[{label:'Higher running cost',incrementalMonthlyCost:2000,transitionExpense:12000}]};
test('financial effects cancel internal transfers and charge transition exactly once',()=>{
 const r=resourceSharing.calculate(base);assert.equal(r.sharedCapacity,500);assert.equal(r.proposal.consumerMonthlyBenefit,7000);assert.equal(r.proposal.providerMonthlyBenefit,2000);assert.equal(r.proposal.ecosystemMonthlyBenefit,9000);assert.equal(r.proposal.ecosystemHorizonBenefit,102000);assert.equal(r.proposal.consumerHorizonBenefit+r.proposal.providerHorizonBenefit,r.proposal.ecosystemHorizonBenefit);assert.equal(r.alternatives[0]?.ecosystemHorizonBenefit,84000);
 const changed=resourceSharing.calculate({...base,internalMonthlyPayment:8000});assert.equal(changed.proposal.ecosystemHorizonBenefit,r.proposal.ecosystemHorizonBenefit);assert.equal(changed.proposal.consumerMonthlyBenefit,2000);
});
test('capacity, avoidable contract fraction, unavailable location and loss-making alternatives remain explicit',()=>{
 const r=resourceSharing.calculate({...base,availableCapacity:250,avoidableExternalFraction:.5});assert.equal(r.avoidedExternalMonthlyCost,2500);
 const none=resourceSharing.calculate({...base,locationCompatible:false});assert.equal(none.proposal.ecosystemHorizonBenefit,0);assert.equal(none.unmetCapacity,500);
 const loss=resourceSharing.calculate({...base,incrementalMonthlyCost:12000});assert.equal(loss.proposal.ecosystemHorizonBenefit,-30000);assert.equal(loss.proposal.breakEvenMonths,null);
 for(const value of [-1,NaN,Infinity])assert.throws(()=>resourceSharing.calculate({...base,requiredCapacity:value}));
});
test('model output and configuration fail closed and arbitrary non-TLS endpoints are rejected',async()=>{
 assert.throws(()=>narrativeSchema.parse({narrative:'Do something',assumptions:[],humanDecisions:[],execute:true}));
 const c=modelConfigSchema.parse({provider:'openai-responses',model:'operator-selected',endpoint:'https://attacker.invalid/responses',apiKeyFile:'missing'});await assert.rejects(createModel(c),/MODEL_CONFIGURATION_INVALID/);
 await assert.rejects(tlsFetch(undefined,undefined)('http://127.0.0.1/'),/TLS_ENDPOINT_REQUIRED/);
});
