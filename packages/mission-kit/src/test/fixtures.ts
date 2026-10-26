import {randomUUID} from 'node:crypto';
import type {MissionAggregateReleaseInput,MissionResourceAllocation} from '@steward/contracts';
import {missionCapacityVector,missionParticipantVector} from '../index.js';
export const instant='2026-01-02T12:00:00.000Z';
/** Synthetic, deterministic dates for reference calculations, never historical client records. */
export function aggregateFixture(participantCount=10):MissionAggregateReleaseInput{return{
 contractVersion:1,synthetic:true,releaseId:randomUUID() as MissionAggregateReleaseInput['releaseId'],programId:randomUUID() as MissionAggregateReleaseInput['programId'],cohortId:randomUUID(),sourceEntityId:randomUUID(),sourceInstallationId:randomUUID(),sourceModuleId:'steward.housing.services',domain:'participant-services',policyId:randomUUID(),periodStart:'2026-01-01T00:00:00.000Z',periodEnd:'2026-01-02T00:00:00.000Z',releasedAt:instant,
 review:{reviewed:true,actorId:randomUUID(),reviewedAt:instant,purpose:'aggregate-program-reporting'},participantCount,
 participantCounts:missionParticipantVector({enrolledParticipants:participantCount}),capacity:missionCapacityVector(),financials:{currency:'USD',actualOperatingCostCents:123400,estimatedUnitCostCents:12340,approvedAvailableCents:250000}
};}
export function resourceFixture():MissionResourceAllocation{return{contractVersion:1,synthetic:true,approved:true,allocationId:randomUUID(),transferId:null,authorityId:randomUUID(),sourceEntityId:randomUUID(),sourceInstallationId:randomUUID(),destinationEntityId:randomUUID(),destinationProgramId:randomUUID() as MissionResourceAllocation['destinationProgramId'],observation:'origin',periodStart:'2026-01-01T00:00:00.000Z',periodEnd:'2026-02-01T00:00:00.000Z',validUntil:'2026-02-01T00:00:00.000Z',currency:'USD',restriction:'training',authorizedCents:100000,availableCents:75000,committedCents:25000,transferredCents:0,spentCents:0,approvedBy:randomUUID(),approvedAt:'2026-01-01T00:00:00.000Z'};}
