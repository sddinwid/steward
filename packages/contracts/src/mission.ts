/** Commercially neutral, synthetic-only Phase 13 service contracts. */
export const MISSION_CONTRACT_VERSION=1 as const;
export const MISSION_AGGREGATE_STREAM='mission_aggregates_v1' as const;
export const MISSION_RESOURCE_STREAM='mission_resources_v1' as const;
type Opaque<T extends string>=string&{readonly __missionIdentity:T};
export type MissionProgramId=Opaque<'program'>;
export type SyntheticParticipantId=Opaque<'synthetic-participant'>;
export type ServiceReferralId=Opaque<'referral'>;
export type MissionAggregateId=Opaque<'aggregate'>;
export type ScopedSyntheticAlias=Opaque<'scoped-synthetic-alias'>;
export type MissionDomain='housing'|'participant-services'|'employment'|'food';
/** Package identity is validated against a verified installed manifest, not a core-owned vendor list. */
export type MissionModuleId=string;
export interface MissionProgram {version:1;programId:MissionProgramId;entityId:string;installationId:string;synthetic:true;status:'open'|'held'|'closed'}
/** This is a disclosure reference, not a credential or proof of authorization. */
export interface ScopedSyntheticParticipantReference {
 version:1;synthetic:true;alias:ScopedSyntheticAlias;sourceProgramId:MissionProgramId;destinationProgramId:MissionProgramId;
 issuerEntityId:string;issuerInstallationId:string;audienceEntityId:string;audienceInstallationId:string;audienceModuleId:MissionModuleId;
 referralId:ServiceReferralId;authorityId:string;authority:'consented'|'documented-authority';expiresAt:string;
}
export interface MissionReferral {version:1;referralId:ServiceReferralId;kind:'housing'|'food'|'training'|'employment';participant:ScopedSyntheticParticipantReference;status:'requested'|'reviewed'|'accepted'|'held'|'withdrawn'|'completed'|'rejected';requestedAt:string;reviewedBy:string|null;reviewedAt:string|null;acknowledgedAt:string|null}
export interface MissionServicePlan {version:1;programId:MissionProgramId;participantId:SyntheticParticipantId;synthetic:true;housing:boolean;food:boolean;training:boolean;employment:boolean;status:'draft'|'reviewed'|'held'|'withdrawn'|'closed';reviewedBy:string|null}
export interface MissionFollowUp {version:1;programId:MissionProgramId;participantRef:SyntheticParticipantId|ScopedSyntheticAlias;kind:'housing-stability'|'employment-retention'|'service-plan';dueAt:string;completedAt:string|null;outcome:'scheduled'|'maintained'|'changed'|'unknown';synthetic:true}
export interface MissionHousingProperty {version:1;propertyId:string;assetProviderInstallationId:string;assetModuleId:string;assetRecordId:string;assetRevision:number;ownerEntityId:string;managerEntityId:string;managementAuthorityId:string;synthetic:true}
export interface MissionBuilding {version:1;buildingId:string;propertyId:string;classification:string;synthetic:true}
export interface MissionHousingUnit {version:1;unitId:string;buildingId:string;capacity:number;classification:string;status:'available'|'reserved'|'occupied'|'maintenance'|'unavailable';synthetic:true}
export interface MissionHousingPlacement {version:1;placementId:string;referralId:ServiceReferralId;programId:MissionProgramId;participantAlias:ScopedSyntheticAlias;unitId:string;startsAt:string;expectedEndsAt:string;actualEndsAt:string|null;status:'requested'|'reviewed'|'approved'|'reserved'|'confirmed'|'departed'|'withdrawn'|'rejected';approvedBy:string|null;approvedAt:string|null;synthetic:true}
export interface MissionMaintenanceRestriction {version:1;restrictionId:string;unitId:string;startsAt:string;endsAt:string|null;status:'active'|'resolved';synthetic:true}
export interface MissionTrainingOpportunity {version:1;providerInstallationId:string;providerModuleId:string;programRecordId:string;programRevision:number;skillCodes:string[];availableSeats:number;startsAt:string;endsAt:string;synthetic:true}
export interface MissionTrainingEnrollment {version:1;enrollmentId:string;referralId:ServiceReferralId;participantAlias:ScopedSyntheticAlias;opportunity:MissionTrainingOpportunity;status:'requested'|'reviewed'|'enrolled'|'participating'|'completed'|'withdrawn';reviewedBy:string|null;achievedSkills:string[];synthetic:true}
export interface MissionEmploymentOpportunity {version:1;providerInstallationId:string;providerModuleId:string;positionRecordId:string;positionRevision:number;requiredSkills:string[];openings:number;location:string;synthetic:true}
export interface MissionEmploymentPlacement {version:1;placementId:string;referralId:ServiceReferralId;participantAlias:ScopedSyntheticAlias;opportunity:MissionEmploymentOpportunity;status:'requested'|'reviewed'|'referred'|'employer-review'|'placed'|'withdrawn'|'closed';reviewedBy:string|null;placedAt:string|null;synthetic:true}
export interface MissionFoodSession {version:1;sessionId:string;programId:MissionProgramId;siteId:string;startsAt:string;plannedMeals:number;deliveredMeals:number;status:'planned'|'open'|'interrupted'|'closed';synthetic:true}
export interface MissionServiceDelivery {version:1;deliveryId:string;sessionId:string;referralId:ServiceReferralId|null;participantAlias:ScopedSyntheticAlias|null;meals:number;supplies:{sku:string;units:number}[];deliveredAt:string;synthetic:true}
export const MISSION_PARTICIPANT_METRICS=['enrolledParticipants','servicePlanParticipants','housingReferredParticipants','housedParticipants','housingRetainedParticipants','trainingEnrolledParticipants','trainingCompletedParticipants','employmentReferredParticipants','employedParticipants','employmentRetainedParticipants','foodServedParticipants','followedUpParticipants','transitionedParticipants','unresolvedAuthorizedReferralParticipants'] as const;
export type MissionParticipantMetric=typeof MISSION_PARTICIPANT_METRICS[number];
export type MissionParticipantVector=Record<Exclude<MissionParticipantMetric,'unresolvedAuthorizedReferralParticipants'>,number|null>&{unresolvedAuthorizedReferralParticipants?:number|null};
export const MISSION_CAPACITY_METRICS=['housingUnits','availableHousingUnits','occupiedHousingUnits','maintenanceRestrictedUnits','trainingSeats','availableTrainingSeats','plannedMeals','deliveredMeals','essentialSupplyUnits','consumedSupplyUnits','employmentOpportunities','localSupplyShortages','housingPlacements','trainingCompletions'] as const;
export type MissionCapacityMetric=typeof MISSION_CAPACITY_METRICS[number];
/** Older sealed v1 releases omit additive optional metrics; omission is unknown. */
export type MissionCapacityVector=Record<Exclude<MissionCapacityMetric,'employmentOpportunities'|'localSupplyShortages'|'housingPlacements'|'trainingCompletions'>,number|null>&{employmentOpportunities?:number|null;localSupplyShortages?:number|null;housingPlacements?:number|null;trainingCompletions?:number|null};
export interface MissionAggregateFinancials {currency:string;actualOperatingCostCents:number|null;estimatedUnitCostCents:number|null;approvedAvailableCents:number|null}
export interface MissionDisclosureReview {reviewed:true;actorId:string;reviewedAt:string;purpose:'aggregate-program-reporting'}
export interface MissionAggregateRelease {
 contractVersion:1;synthetic:true;approved:true;sealed:true;releaseId:MissionAggregateId;programId:MissionProgramId;cohortId:string;
 sourceEntityId:string;sourceInstallationId:string;sourceModuleId:MissionModuleId;domain:MissionDomain;policyId:string;
 periodStart:string;periodEnd:string;releasedAt:string;review:MissionDisclosureReview;
 minimumGroupSize:5;suppressed:boolean;participantCount:number|null;participantCounts:MissionParticipantVector;
 capacity:MissionCapacityVector;financials:MissionAggregateFinancials;
}
/** Input stays local. Its unsuppressed vector/member list must never be synchronized. */
export type MissionAggregateReleaseInput=Omit<MissionAggregateRelease,'participantCount'|'suppressed'|'minimumGroupSize'|'sealed'|'approved'> & {participantCount:number};
/** Amounts describe explicit authority, never inferred revenue/profit or automatic transfers. */
export interface MissionResourceAllocation {
 contractVersion:1;synthetic:true;approved:true;allocationId:string;transferId:string|null;authorityId:string;
 sourceEntityId:string;sourceInstallationId:string;sourceProgramId:MissionProgramId;destinationEntityId:string;destinationProgramId:MissionProgramId;
 observation:'origin'|'recipient';periodStart:string;periodEnd:string;validUntil:string;
 currency:string;restriction:'housing'|'food'|'training'|'employment'|'program';
 authorizedCents:number;availableCents:number;committedCents:number;transferredCents:number;spentCents:number;
 approvedBy:string;approvedAt:string;
}
export interface MissionProgramCost {version:1;programId:MissionProgramId;entityId:string;currency:string;periodStart:string;periodEnd:string;basis:'actual-program-expense'|'estimated-future-service-cost';amountCents:number|null;unit:'housing-unit'|'meal'|'training-seat'|'employment-support';synthetic:true;authorityId:string}
