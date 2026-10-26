import type {SourceReference} from './business.js';
export const SCIENTIFIC_CONTRACT_VERSION=1 as const;
/** Derived analytical evidence, never a fabricated Worker operational record. */
export interface ScientificEvidenceReference {schemaVersion:1;jobId:string;datasetId:string;inputDigest:string}
export type ScientificCapability='describe-series'|'demand-forecast'|'procurement-optimization'|'scenario-comparison'|'mission-sustainability';
export interface ScientificProvenance {
 datasetId:string;synthetic:boolean;basis:'authorized-synchronized-projection'|'synthetic-analytical-history';
 asOf:string;references:SourceReference[];
 derivedFrom?:ScientificEvidenceReference[];
}
export interface ScientificRequest {
 schemaVersion:1;jobId:string;capability:ScientificCapability;principalId:string;entityIds:string[];
 provenance:ScientificProvenance;parameters:Record<string,unknown>;executionMillis:number;
}
export interface ScientificResult {
 schemaVersion:1;jobId:string;capability:ScientificCapability;inputDigest:string;elapsedMillis:number;
 provenance:ScientificProvenance;entityIds:string[];decisionExecuted:false;
 engine:{service:string;version:string;contractVersion:1;python:string;numpy:string;scipy:string;pandas:string};
 calculation:Record<string,unknown>;
}
export interface AnalyticalCapabilityDescriptor {
 id:string;version:1;name:string;engine:'typescript'|'python';inputSchema:Record<string,unknown>;outputSchema:Record<string,unknown>;
 permission:'analytical.read';sensitivity:'business';readonly:true;
 resources:{maximumInputBytes:number;maximumExecutionMillis:number;maximumConcurrency:number};
 provenanceRequired:boolean;
}
