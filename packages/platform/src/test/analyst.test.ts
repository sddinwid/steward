import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resourceSharing, type SharingInput } from '../analytical-capabilities.js';
import { modelConfigSchema, createModel, tlsFetch } from '../analyst-model.js';
import { narrativeSchema, parseNarrative } from '../analyst.js';
import { agentProof,verifyAgentProof } from '../mcp-agent-identity.js';
import { resourcePage, resourceQuerySchema, modelToolResult, resourceMatches } from '../analyst-context.js';
import { ollamaMessages, ollamaTurn } from '../ollama-model.js';

test('native Ollama preserves tool arguments/results and rejects orphan or malformed responses',()=>{
 const input=[{role:'user',content:'Question'},{type:'function_call',call_id:'a',name:'query_resource_matches',arguments:'{"limit":1}'},{type:'function_call_output',call_id:'a',output:'{"untrustedBusinessData":true,"result":{"actual":"evidence"}}'}];
 const messages=ollamaMessages(input,'instructions');assert.equal(messages[2].tool_calls[0].function.name,'query_resource_matches');assert.deepEqual(messages[2].tool_calls[0].function.arguments,{limit:1});assert.equal(messages[3].content,input[2]?.output);assert.equal(messages[3].tool_name,'query_resource_matches');
 assert.throws(()=>ollamaMessages([{type:'function_call_output',call_id:'unknown',output:'data'}],'instructions'));
 const turn=ollamaTurn({done:true,done_reason:'stop',message:{content:'',tool_calls:[{function:{name:'query_resource_matches',arguments:{limit:1}}}]}});assert.equal(turn.calls[0]?.name,'query_resource_matches');assert.deepEqual(JSON.parse(turn.calls[0]!.arguments),{limit:1});
 assert.throws(()=>ollamaTurn({done:true,done_reason:'length',message:{content:'truncated'}}));assert.throws(()=>ollamaTurn({done:true,message:{content:'',tool_calls:[{function:{name:'x',arguments:'not an object'}}]}}));
});

test('candidate screening uses actual cross-entity site/currency evidence and never invents a pair',()=>{
 const source={entity_id:'supplier',module_id:'module',stream_id:'warehouse_assets',record_id:'s',revision:2,payload:{site:'Depot',available_m3:120,currency:'EUR'}};
 const demand={entity_id:'consumer',module_id:'module',stream_id:'storage_requirements',record_id:'d',revision:3,payload:{site:'depot',required_m3:100,monthly_external_cost:500,currency:'EUR'}};
 const match=resourceMatches([source,demand],{limit:1});assert.equal(match.total,1);assert.equal(match.matches[0]?.supply?.recordId,'s');assert.equal(match.matches[0]?.demand?.revision,3);
 assert.equal(resourceMatches([source,{...demand,entity_id:'supplier'}],{}).total,0);assert.equal(resourceMatches([source,{...demand,payload:{...demand.payload,currency:'USD'}}],{}).total,0);assert.equal(resourceMatches([source,{...demand,payload:{...demand.payload,site:'Elsewhere'}}],{}).total,0);
 assert.equal(resourceMatches([source],{}).total,0);
});
test('final narrative permits a single JSON fence but rejects prose, malformed JSON and extra commands',()=>{
 const r={narrative:'Observed evidence only',assumptions:['Illustrative cost'],humanDecisions:['Review site']};assert.deepEqual(parseNarrative('```json\n'+JSON.stringify(r)+'\n```'),r);
 assert.throws(()=>parseNarrative('Here is analysis: '+JSON.stringify(r)));assert.throws(()=>parseNarrative(JSON.stringify({...r,execute:true})));assert.throws(()=>parseNarrative('not JSON'));
});

test('compact resource pages retain exact source references, filter sites, and reject arbitrary fields',()=>{
 const rows=[1,2,3].map(n=>({record_id:'record-'+n,entity_id:'entity',module_id:'module',stream_id:'warehouse_assets',revision:n,installation_id:'worker',source_at:'timestamp',payload:{name:'Untrusted business text',site:n===3?'Other':'Depot',available_m3:n*10,currency:'EUR',privateUnrequestedField:'not disclosed'}}));
 const first=resourcePage(rows,{category:'supply',site:'depot',fields:['availableCapacity'],limit:1});
 assert.equal(first.total,2);assert.equal(first.nextOffset,1);assert.equal(first.resources[0]?.recordId,'record-2');assert.equal(first.resources[0]?.revision,2);
 assert.equal(first.resources[0]?.sourceWorker,'worker');assert.equal(first.resources[0]?.availableCapacity,20);assert.equal(first.resources[0]?.name,undefined);assert.ok(!JSON.stringify(first).includes('privateUnrequestedField'));
 assert.equal(resourcePage(rows,{category:'supply',site:'depot',offset:1,limit:1}).resources[0]?.recordId,'record-1');
 assert.throws(()=>resourceQuerySchema.parse({fields:['*']}));assert.throws(()=>resourceQuerySchema.parse({limit:21}));assert.throws(()=>resourceQuerySchema.parse({offset:-1}));
});
test('model context eliminates duplicate MCP text while retaining original full evidence',()=>{
 const data={calculation:{proposal:{ecosystemMonthlyBenefit:9}},supportingReferences:[{revision:3}],affectedEntities:['entity'],observed:{supply:{name:'Original source',allFields:'retained'},demand:{name:'Original demand'},supplyWorker:'w1',demandWorker:'w2',supplyAt:'now',demandAt:'now'}};
 const raw={content:[{type:'text',text:JSON.stringify(data)}],structuredContent:{schemaVersion:1,data}};const before=JSON.stringify(raw);
 const view=modelToolResult('analyze_resource_sharing_by_id',raw,true);
 assert.equal(view.content,undefined);assert.equal(view.structuredContent.data.observed.supply,undefined);assert.deepEqual(view.structuredContent.data.calculation,data.calculation);assert.deepEqual(view.structuredContent.data.supportingReferences,data.supportingReferences);assert.equal(JSON.stringify(raw),before);
 const error={isError:true,content:[{type:'text',text:'failed'}]};assert.deepEqual(modelToolResult('query_entity_resources',error,true),error);
});
test('model, tool, overall and context budgets configure independently with bounded defaults',()=>{
 const c={provider:'responses-compatible',model:'local',endpoint:'https://localhost/responses',apiKeyFile:'secret'};
 assert.equal(modelConfigSchema.parse(c).modelCallTimeoutMs,25000);
 const tuned=modelConfigSchema.parse({...c,toolProfile:'compact',modelCallTimeoutMs:90000,toolTimeoutMs:6000,investigationTimeoutMs:600000,maxContextChars:48000});assert.equal(tuned.toolTimeoutMs,6000);assert.equal(tuned.modelCallTimeoutMs,90000);assert.equal(tuned.investigationTimeoutMs,600000);
 for(const values of [{modelCallTimeoutMs:120001},{toolTimeoutMs:30001},{investigationTimeoutMs:900001},{maxContextChars:200001}])assert.throws(()=>modelConfigSchema.parse({...c,...values}));
});
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

test('commerce model view excludes legacy pre-fee margins and preserves unknown contribution without mutating evidence',()=>{
 const raw={structuredContent:{data:{calculation:{capabilityId:'steward.commerce-performance',schemaVersion:1,currency:'USD',displayAmounts:{grossMargin:'USD 999.00',recognizedRevenue:'USD 1200.00',refunds:'USD 0.00'},orders:[{grossMargin:'USD 999.00'}],contributionSummary:{marginBasis:'incomplete',displayAmounts:{contributionMargin:'UNKNOWN'}},contributionAnalysis:[{sourceId:'source-1',marginBasis:'incomplete',displayAmounts:{contributionMargin:'UNKNOWN'},missingCosts:['transactionFees']}],assumptions:['Unknown is not zero']},supportingReferences:[{recordId:'source-1'}],affectedEntities:['entity'],observed:{sources:[{reference:{recordId:'source-1'},sourceWorker:'worker',observedAt:'now',payload:{complete:'retained'}}]}}}};
 const original=JSON.stringify(raw);for(const compact of [true,false]){const view=modelToolResult('analyze_commerce_by_id',raw,compact).structuredContent.data.calculation;assert.equal(view.displayAmounts.contributionMargin,'UNKNOWN');assert.equal(view.displayAmounts.grossMargin,undefined);assert.equal(view.orders,undefined);assert.equal(view.contributionAnalysis[0].displayAmounts.contributionMargin,'UNKNOWN');assert(!JSON.stringify(view).includes('USD 999.00'));}assert.equal(JSON.stringify(raw),original);
});
