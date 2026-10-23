/** Versioned analytical projections; copies never acquire operational authority. */
export const BUSINESS_PROJECTION_VERSION=1 as const;
export type BusinessEvidenceCategory='procurement-demand'|'procurement-quote'|'purchase-commitment'|'sales-demand'|'replenishment'|'workforce-supply'|'training'|'workforce-demand';
export interface SourceReference {entityId:string;moduleId:string;streamId:string;recordId:string;revision:number}
export interface ApprovedProcurementDemand {approved:true;sku:string;unit:string;currency:string;quantity:number;unitPriceCents:number;shippingCents:number;transitionCents:number;baselineExternal:true}
export interface ApprovedProcurementQuote {approved:true;sku:string;unit:string;currency:string;minimumQuantity:number;unitPriceCents:number;shippingCents:number;relationship:'external';validUntil:string}
export interface WorkforceSupply {skillCode:string;availablePeople:number|null;completions:number|null;minimumGroupSize:number;synthetic:true}
export interface TrainingCapacity {programCode:string;skillCode:string;remainingSeats:number;completed:number|null;minimumGroupSize:number;synthetic:true}
export interface WorkforceDemand {positionCode:string;requiredSkills:string[];openings:number;synthetic:true}
