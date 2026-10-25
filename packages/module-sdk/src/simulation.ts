import {canonical,type ModulePackageManifest} from './index.js';
import type {IntegrationCommand} from './integration.js';
export const SIMULATION_SCENARIOS=['normal','seasonal-demand','low-margin','production-delay','inventory-shortage','refund-cancellation','shipping-increase','missing-mapping','purchasing-opportunity'] as const;
export interface SimulationOrigin {
 version:1;datasetId:string;runId:string;ecosystemId:string;seed:number;eventIndex:number;
 scenario:typeof SIMULATION_SCENARIOS[number];simulatedAt:string;speed:number;
}
export interface SimulationDeclaration {version:1;role:'engine'|'provider'|'participant'}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(code:string):never=>{throw new Error('INTEGRATION_SIMULATION_'+code);};
export function validateSimulationOrigin(value:unknown):asserts value is SimulationOrigin {
 const v=value as SimulationOrigin;
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['version','datasetId','runId','ecosystemId','seed','eventIndex','scenario','simulatedAt','speed'].includes(k))||v.version!==1||![v.datasetId,v.runId,v.ecosystemId].every(x=>typeof x==='string'&&uuid.test(x))||!Number.isSafeInteger(v.seed)||v.seed<0||v.seed>0xffffffff||!Number.isSafeInteger(v.eventIndex)||v.eventIndex<0||v.eventIndex>1000000||!SIMULATION_SCENARIOS.includes(v.scenario)||typeof v.simulatedAt!=='string'||!Number.isFinite(Date.parse(v.simulatedAt))||!Number.isSafeInteger(v.speed)||v.speed<1||v.speed>600)fail('PROVENANCE_INVALID');
}
export function sameSimulationDataset(a:SimulationOrigin,b:SimulationOrigin){return a.datasetId===b.datasetId&&a.runId===b.runId&&a.ecosystemId===b.ecosystemId;}
/** Signed declarations do not grant authority; normal SSMA approval remains required. */
export function assertSimulationBoundary(command:IntegrationCommand,source:ModulePackageManifest,target:ModulePackageManifest,configuration:Record<string,unknown>,known?:SimulationOrigin){
 const origin=command.simulation;
 if(known&&(!origin||canonical(origin)!==canonical(known)))fail('PROVENANCE_CHANGED');
 if(['engine','provider'].includes(source.simulation?.role??'')&&!origin)fail('PROVENANCE_REQUIRED');
 if(!origin)return;
 validateSimulationOrigin(origin);
 // Reject before a live adapter or its private credentials can be addressed.
 if(target.connector||configuration.mode==='live')fail('LIVE_PROVIDER_DENIED');
 if(!source.simulation||!target.simulation)fail('PARTICIPANT_REQUIRED');
}
/** Per-module epoch barriers reject delayed work after a selected dataset reset. */
export const simulationEpochSql=`
ALTER TABLE integration_inbox ADD COLUMN IF NOT EXISTS simulation jsonb;
ALTER TABLE business_requests ADD COLUMN IF NOT EXISTS simulation jsonb;
CREATE TABLE IF NOT EXISTS simulation_dataset_epochs(dataset_id uuid PRIMARY KEY,run_id uuid NOT NULL,state text NOT NULL CHECK(state IN ('active','closed')),updated_at timestamptz NOT NULL DEFAULT now());
`;
