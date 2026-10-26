/** Phase 14: original-currency financial authority. Projections never confer authority. */
export interface Money { currency:'USD'|'EUR'; minorUnits:number; scale:2 }
export interface EconomicSourceReference {entityId:string;installationId:string;moduleId:string;streamId:string;recordId:string;revision:number;observedAt:string;classification:'observation'|'estimate'|'allocation'|'journal'|'synthetic-settlement'|'receipt'|'expenditure';synthetic:true}
export type EconomicResourceKind='cash'|'facility'|'inventory'|'equipment'|'staff-time'|'transport'|'service';
export interface FinancialPolicy {
 contractVersion:1;policyId:string;version:number;ownerEntityId:string;managerEntityId:string|null;
 currency:Money['currency'];approvalLimitCents:number;delegationLimitCents:number;minimumReserveCents:number;
 reserveCoverageDays:number;liquidityBufferCents:number;cashHorizonDays:number;observationMaxAgeHours:number;
 separationOfDuties:true;requiredApprovals:number;approvalLifetimeHours:number;validUntil:string;revoked:boolean;
}
export interface FinancialAuthorityGrant {grantId:string;actorId:string;entityId:string;policyId:string;policyVersion:number;roles:('requester'|'approver'|'controller'|'executor'|'receiver'|'discloser')[];limitCents:number;expiresAt:string;revoked:boolean}
export interface ResourceAvailabilityInput {
 contractVersion:1;ownerEntityId:string;currency:Money['currency'];observedAt:string;synthetic:true;
 cashCents:number;obligationsCents:number;restrictedCents:number;existingCommitmentsCents:number;
 dailyOperatingExpenseCents:number;futureCashRequirementCents:number;sourceReferences:EconomicSourceReference[];
}
export interface ResourceAvailabilityAssessment {
 contractVersion:1;synthetic:true;currency:Money['currency'];cashCents:number;reserveCents:number;
 deductionsCents:number;potentiallyAvailableCents:number;shortfallCents:number;
 legallyDistributable:false;authority:'assessment-only';method:'cash-less-protected-requirements-v1';
}
export interface NoncashResource {
 ownerEntityId:string;managerEntityId:string|null;kind:Exclude<EconomicResourceKind,'cash'>;
 resourceId:string;unit:string;capacityMode:'consumable'|'reusable';quantity:number;reservedQuantity:number;operationalPriorityQuantity:number;
 availableFrom:string;availableUntil:string;restriction:string;valuation:Money|null;
 valuationBasis:'documented-unit-cost'|'documented-replacement-estimate'|'unknown';source:EconomicSourceReference;
}
export type BudgetState='draft'|'submitted'|'reviewed'|'approved'|'active'|'revised'|'closed';
export interface BudgetLine {category:string;service:'housing'|'food'|'training'|'employment'|'other';amount:Money;restriction:string;minimumOperatingCents:number;serviceUnitCostCents:number|null;serviceCapacity:number|null}
export interface BudgetVersion {contractVersion:1;budgetId:string;version:number;programId:string;ownerEntityId:string;periodStart:string;periodEnd:string;currency:Money['currency'];lines:BudgetLine[];state:BudgetState;previousVersionId:string|null;requestedBy:string;approvedBy:string|null;synthetic:true}
export type CommitmentState='proposed'|'reserve-pending'|'reserved'|'contributor-approved'|'receiver-pending'|'receiver-accepted'|'authorized'|'pending-settlement'|'settlement-uncertain'|'settled'|'receipt-pending'|'reconciled'|'rejected'|'expired'|'cancelled'|'disputed';
export interface ContributionTerms {
 contractVersion:1;commitmentId:string;version:number;sourceEntityId:string;sourceInstallationId:string;
 destinationEntityId:string;destinationInstallationId:string;sourceProgramId:string;destinationProgramId:string;
 currency:Money['currency'];amountCents:number;resourceKind:EconomicResourceKind;capacityMode:'cash'|'consumable'|'reusable';resourceId:string|null;
 quantity:number;unit:string;valuationCents:number|null;valuationBasis:NoncashResource['valuationBasis'];operatingCostCents:number;restriction:string;purpose:string;
 policyId:string;policyVersion:number;assessmentId:string;expiresAt:string;synthetic:true;
}
export interface FinancialApproval {approvalId:string;termsDigest:string;policyId:string;policyVersion:number;actorId:string;entityId:string;decision:'approve'|'reject';approvedAt:string;expiresAt:string;authorityGrantId:string}
export interface AccountingLine {account:'cash'|'receivable'|'payable'|'restricted-fund'|'contribution-expense'|'contribution-income'|'service-expense'|'noncash-clearing'|'external-cash-clearing';direction:'debit'|'credit';amount:Money}
export interface FinancialEvent {
 contractVersion:1;eventId:string;ownerEntityId:string;transactionId:string;classification:'external'|'intercompany'|'internal';
 kind:'cash-observation-adjustment'|'commitment'|'synthetic-settlement'|'receipt'|'expenditure'|'noncash-delivery'|'return'|'reversal';
 source:EconomicSourceReference;lines:AccountingLine[];reversesEventId:string|null;occurredAt:string;actorId:string;synthetic:true;
}
export interface SettlementEvidence {contractVersion:1;provider:'steward.synthetic-settlement';synthetic:true;settlementId:string;commitmentId:string;termsDigest:string;sourceEntityId:string;destinationEntityId:string;amount:Money;status:'pending'|'confirmed'|'uncertain'|'reversed';executedAt:string|null;receiptId:string|null;reconciliation:'outstanding'|'matched'|'disputed'|'reversed'}
export interface ResourceDelivery {deliveryId:string;commitmentId:string;resourceId:string;quantity:number;unit:string;status:'reserved'|'delivered'|'in-use'|'returned'|'consumed'|'disputed';valuation:Money|null;operatingCost:Money|null;confirmedBy:string;occurredAt:string;synthetic:true}
