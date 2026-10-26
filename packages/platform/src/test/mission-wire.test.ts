import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {DataEvent} from '@steward/contracts';
import {prepareMissionAggregateRelease,missionParticipantVector,missionCapacityVector} from '@steward/mission-kit';
import {validateEvent} from '../synchronization.js';
const now=()=>new Date().toISOString();
function event():DataEvent {
 const entityId=randomUUID(),installationId=randomUUID(),moduleId='steward.housing.services',releaseId=randomUUID(),end=now();
 const p=prepareMissionAggregateRelease({contractVersion:1,synthetic:true,releaseId,programId:randomUUID(),cohortId:randomUUID(),sourceEntityId:entityId,sourceInstallationId:installationId,sourceModuleId:moduleId,domain:'participant-services',policyId:randomUUID(),periodStart:new Date(Date.now()-3600000).toISOString(),periodEnd:end,releasedAt:end,review:{reviewed:true,actorId:randomUUID(),reviewedAt:end,purpose:'aggregate-program-reporting'},participantCount:1,participantCounts:missionParticipantVector({enrolledParticipants:1}),capacity:missionCapacityVector({}),financials:{currency:'USD',actualOperatingCostCents:1000,estimatedUnitCostCents:1000,approvedAvailableCents:10000}} as any);
 return{envelopeVersion:1,eventId:randomUUID(),source:{installationId,role:'worker',entity:{entityId,displayName:'Public service organization'}},destinationInstallationId:randomUUID(),sequence:'1',occurredAt:now(),eventType:'record.upsert',payloadVersion:1,moduleId,streamId:'mission_aggregates_v1',recordId:releaseId,recordRevision:1,disclosure:{contractVersion:1,kind:'program-aggregate',domain:'participant-services'},payload:{id:releaseId,revision:1,projection:p}} as unknown as DataEvent;
}
test('private-service envelopes accept only sealed aggregate rows and opaque metadata',()=>{const e=event();validateEvent(e);assert.equal((e.payload.projection as any).participantCount,null);assert(!JSON.stringify(e).includes('SYN-PART-'));});
test('private contents cannot hide in envelope, source, projection or correlation siblings',()=>{
 for(const change of [(e:any)=>e.caseNotes='private',(e:any)=>e.source.privateNote='private',(e:any)=>e.source.entity.caseNotes='private',(e:any)=>e.payload.caseFile='private',(e:any)=>e.payload.projection.participantRef='SYN-PART-'+'A'.repeat(32),(e:any)=>e.correlationId='private case name',(e:any)=>e.disclosure.private='private']){const e=event();change(e);assert.throws(()=>validateEvent(e));}
});
test('private sources cannot evade their stream, domain, identity or immutable revision contract',()=>{
 for(const change of [(e:any)=>delete e.disclosure,(e:any)=>{delete e.disclosure;e.streamId='warehouse_assets';},(e:any)=>e.disclosure.domain='housing',(e:any)=>e.payload.projection.sourceModuleId='another.private.provider',(e:any)=>e.payload.projection.sourceEntityId=randomUUID(),(e:any)=>{e.recordRevision=2;e.sequence='2';e.payload.revision=2;},(e:any)=>e.payload.projection.participantCount=1]){const e=event();change(e);assert.throws(()=>validateEvent(e));}
 const e=event();e.correlationId=randomUUID();validateEvent(e);
});
