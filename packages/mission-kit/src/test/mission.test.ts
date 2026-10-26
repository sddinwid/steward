import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {prepareMissionAggregateRelease,validateMissionAggregateRelease,validateMissionResourceAllocation,createSyntheticParticipantId,createScopedSyntheticAlias,missionParticipantVector,missionCapacityVector,deduplicateMissionAllocations,MissionContractError} from '../index.js';
import {aggregateFixture,resourceFixture,instant} from './fixtures.js';
const now=new Date(instant);
test('synthetic local identities and audience aliases have distinct non-production namespaces',()=>{
 const participants=new Set(Array.from({length:100},createSyntheticParticipantId)),aliases=new Set(Array.from({length:100},createScopedSyntheticAlias));assert.equal(participants.size,100);assert.equal(aliases.size,100);assert([...participants].every(v=>/^SYN-PART-[A-F0-9]{32}$/.test(v)));assert([...aliases].every(v=>/^SYNREF-[A-F0-9]{32}$/.test(v)));assert([...participants].every(v=>!aliases.has(v as any)));
});
test('missing and nonapplicable measures remain unknown; fixed vectors reject arbitrary dimensions',()=>{
 const p=missionParticipantVector({enrolledParticipants:10});assert.equal(p.housedParticipants,null);assert.equal(p.enrolledParticipants,10);assert.throws(()=>missionParticipantVector({participantName:1} as any),MissionContractError);assert.throws(()=>missionCapacityVector({district:4} as any),MissionContractError);
});
test('a small cohort suppresses every outcome, capacity and financial inference proxy',()=>{
 const input=aggregateFixture(4);input.capacity=missionCapacityVector({housingUnits:4,availableHousingUnits:0,occupiedHousingUnits:4,maintenanceRestrictedUnits:0});const before=JSON.stringify(input),result=prepareMissionAggregateRelease(input,now);assert.equal(JSON.stringify(input),before);assert.equal(result.suppressed,true);assert.equal(result.participantCount,null);assert(Object.values(result.participantCounts).every(v=>v===null));assert(Object.values(result.capacity).every(v=>v===null));assert.equal(result.financials.actualOperatingCostCents,null);assert.equal(result.financials.estimatedUnitCostCents,null);assert.equal(result.financials.approvedAvailableCents,null);
});
test('positive small cells and small complements suppress the entire vector',()=>{
 for(const value of [1,2,3,4,6,7,8,9]){const input=aggregateFixture(10);input.participantCounts.housedParticipants=value;assert.equal(prepareMissionAggregateRelease(input,now).suppressed,true);}
 for(const value of [0,5,10]){const input=aggregateFixture(10);input.participantCounts.housedParticipants=value;assert.equal(prepareMissionAggregateRelease(input,now).suppressed,false);}
});
test('correlated service stages cannot reveal a small group through pairwise differences',()=>{
 const input=aggregateFixture(30);input.participantCounts.trainingEnrolledParticipants=16;input.participantCounts.trainingCompletedParticipants=15;assert.equal(prepareMissionAggregateRelease(input,now).suppressed,true);
 input.participantCounts.trainingEnrolledParticipants=20;assert.equal(prepareMissionAggregateRelease(input,now).suppressed,false);
 input.capacity=missionCapacityVector({trainingSeats:30,availableTrainingSeats:9});assert.equal(prepareMissionAggregateRelease(input,now).suppressed,true);
});
test('capacity-derived housing occupancy and training usage cannot bypass complementary suppression',()=>{
 const h=aggregateFixture(10);h.capacity=missionCapacityVector({housingUnits:10,availableHousingUnits:9,maintenanceRestrictedUnits:0});assert.equal(prepareMissionAggregateRelease(h,now).suppressed,true);
 const t=aggregateFixture(10);t.capacity=missionCapacityVector({trainingSeats:10,availableTrainingSeats:7});assert.equal(prepareMissionAggregateRelease(t,now).suppressed,true);
 h.capacity.occupiedHousingUnits=4;assert.throws(()=>prepareMissionAggregateRelease(h,now),MissionContractError);
 t.capacity.availableTrainingSeats=11;assert.throws(()=>prepareMissionAggregateRelease(t,now),MissionContractError);
 const outside=aggregateFixture(5);outside.capacity=missionCapacityVector({trainingSeats:10,availableTrainingSeats:0});assert.throws(()=>prepareMissionAggregateRelease(outside,now),MissionContractError);
});
test('wire validation refuses forged unsuppressed cells or residual capacity/cost side channels',()=>{
 const result=prepareMissionAggregateRelease(aggregateFixture(10),now);assert.throws(()=>validateMissionAggregateRelease({...result,participantCounts:{...result.participantCounts,housedParticipants:1}},undefined,now),MissionContractError);
 const small=prepareMissionAggregateRelease(aggregateFixture(1),now);assert.throws(()=>validateMissionAggregateRelease({...small,capacity:{...small.capacity,housingUnits:1}},undefined,now),MissionContractError);assert.throws(()=>validateMissionAggregateRelease({...small,financials:{...small.financials,actualOperatingCostCents:500}},undefined,now),MissionContractError);
});
test('closed projections reject case identifiers, notes, arbitrary filters and coercion without echoing values',()=>{
 const input=aggregateFixture(10);for(const extra of [{participantRef:'SYN-PART-SECRET'},{privateNotes:'Private case detail'},{dimensions:{gender:'x'}},{filters:{age:18}}])assert.throws(()=>prepareMissionAggregateRelease({...input,...extra},now),(e:any)=>e instanceof MissionContractError&&!e.message.includes('Private case detail')&&!e.message.includes('SYN-PART-SECRET'));
 assert.throws(()=>prepareMissionAggregateRelease({...input,participantCount:'10'},now),MissionContractError);assert.throws(()=>prepareMissionAggregateRelease({...input,review:{...input.review,notes:'Case text'}},now),MissionContractError);
});
test('aggregate identity, source domain, review and sealed reporting cutoff are enforced',()=>{
 const input=aggregateFixture(10),result=prepareMissionAggregateRelease(input,now);assert.deepEqual(validateMissionAggregateRelease(result,{entityId:input.sourceEntityId,installationId:input.sourceInstallationId,moduleId:input.sourceModuleId},now),result);
 assert.throws(()=>validateMissionAggregateRelease(result,{entityId:randomUUID(),installationId:input.sourceInstallationId},now),(e:any)=>e.statusCode===403);
 assert.throws(()=>prepareMissionAggregateRelease({...input,domain:'food'},now),MissionContractError);assert.throws(()=>prepareMissionAggregateRelease({...input,review:{...input.review,reviewed:false}},now),MissionContractError);assert.throws(()=>prepareMissionAggregateRelease({...input,periodEnd:'2026-01-03T00:00:00.000Z'},now),MissionContractError);assert.throws(()=>prepareMissionAggregateRelease({...input,periodStart:'2026-02-30T00:00:00.000Z'},now),MissionContractError);
 input.participantCounts.enrolledParticipants=11;assert.throws(()=>prepareMissionAggregateRelease(input,now),MissionContractError);
});
test('independent provider packages use verified identity/domain rather than a vendor allowlist',()=>{
 const input=aggregateFixture(10);input.sourceModuleId='independent.support';const source={entityId:input.sourceEntityId,installationId:input.sourceInstallationId,moduleId:input.sourceModuleId,domain:input.domain};
 assert.throws(()=>prepareMissionAggregateRelease(input,now),MissionContractError);const result=prepareMissionAggregateRelease(input,now,source);assert.equal(result.sourceModuleId,'independent.support');assert.deepEqual(validateMissionAggregateRelease(result,source,now),result);
 assert.throws(()=>validateMissionAggregateRelease(result,undefined,now),MissionContractError);assert.throws(()=>validateMissionAggregateRelease(result,{...source,moduleId:'independent.wrong'},now),MissionContractError);assert.throws(()=>validateMissionAggregateRelease(result,{...source,domain:'food'},now),MissionContractError);assert.throws(()=>validateMissionAggregateRelease({...result,sourceModuleId:'BAD/source'},source,now),MissionContractError);
});
test('approved resource allocations keep exact cents, legal authority, restrictions and cash states separate',()=>{
 const v=resourceFixture();assert.deepEqual(validateMissionResourceAllocation(v,{entityId:v.sourceEntityId,installationId:v.sourceInstallationId}),v);
 for(const change of [{availableCents:75001},{spentCents:1},{transferredCents:25001},{authorizedCents:-1},{availableCents:1.5},{currency:'US'},{profitCents:999999},{approved:false}])assert.throws(()=>validateMissionResourceAllocation({...v,...change}),MissionContractError);
 assert.throws(()=>validateMissionResourceAllocation({...v,transferredCents:20000}),MissionContractError);assert.throws(()=>validateMissionResourceAllocation(v,{entityId:randomUUID(),installationId:v.sourceInstallationId}),(e:any)=>e.statusCode===403);
});
test('recipient mirrors never create extra availability and duplicate transfer/allocation claims fail',()=>{
 const v=resourceFixture(),mirror={...v,observation:'recipient' as const};assert.deepEqual(deduplicateMissionAllocations([v,v,mirror]),[v]);assert.deepEqual(deduplicateMissionAllocations([mirror]),[]);assert.throws(()=>deduplicateMissionAllocations([v,{...v,availableCents:74000}]),MissionContractError);
 const transferred={...v,transferId:randomUUID(),transferredCents:20000};assert.throws(()=>deduplicateMissionAllocations([transferred,{...transferred,allocationId:randomUUID()}]),MissionContractError);assert.throws(()=>deduplicateMissionAllocations([v,{...v,sourceEntityId:randomUUID()}]),MissionContractError);
});
