import type pg from 'pg';
import {canonical,validateEconomicSummary} from '@steward/module-sdk';
import {economicAuthorization} from './economic-authorization.js';
import {ECONOMIC_PLANNING,materializeEconomicScenario} from './economic-planning.js';
import {validateScientificResult} from './scientific-client.js';
import {fail} from './security/crypto.js';
/** Recheck retained source authority and exact immutable calculation ancestry on every governed read. */
export async function verifyEconomicCalculation(pool:pg.Pool,masterId:string,accountId:string,row:any,permission:'read'|'calculate'|'publish'='read',current=false){
 if(!row||row.created_by!==accountId||row.result?.capabilityId!==ECONOMIC_PLANNING)fail(404,'Economic calculation unavailable');
 await economicAuthorization(pool,masterId).resolve(accountId,row.source_references,permission,current);
 const scenario=(await pool.query('SELECT * FROM mission_scenarios WHERE scenario_id=$1 AND created_by=$2',[row.input?.scenarioId,accountId])).rows[0];
 try{if(!scenario||scenario.scenario_id!==row.result.scenarioId||canonical(scenario.request)!==canonical(row.input.request)||canonical(row.source_references)!==canonical(scenario.request.financialReferences))throw Error();const input=row.input.scientificRequest,materialized=materializeEconomicScenario(scenario.request,row.input.evidence,Date.parse(input.provenance.asOf));if(input.jobId!==row.calculation_id||input.principalId!==accountId||canonical(input.parameters)!==canonical(materialized.parameters)||canonical(input.provenance.references)!==canonical(row.source_references.map(({installationId,...r}:any)=>r)))throw Error();validateScientificResult(row.result.scientific,input);if(row.result.status!==row.result.scientific.calculation.status)throw Error();}catch{fail(404,'Economic calculation evidence unavailable');}
 return row;
}
export function economicFindingText(row:any){const currency=row.result.currency,money=(n:number)=>currency+' '+Math.floor(n/100)+'.'+String(n%100).padStart(2,'0');return 'Synthetic reviewed economic alternatives, never summed. '+row.result.scientific.calculation.scenarios.map((s:any)=>s.name+': proposed contribution '+money(s.calculation.proposedContributionCents)+'; '+s.calculation.programEffects.map((p:any)=>'programme '+p.programId+', period '+(p.period+1)+': '+p.additionalUnits+' conditional '+p.unit+', base cost '+money(p.operatingCents)+', incremental cost '+money(p.serviceCostCents)).join('; ')).join('. ')+'. Each contributing and receiving entity must independently review current source evidence, restrictions, reserves and authority. No funding, reservation, transfer, service or participant decision was executed. These conditional service units are not observed outcomes, unique people or causal impact. Source evidence and original scenario assumptions are retained.';}

/** Delivery scope is derived from original retained provider bindings, never affected-entity guesses. */
export function economicFindingScopes(input:any,references:any[],installationId:string,entityId:string){
 if(!Array.isArray(input?.evidence)||input.evidence.length!==references.length)fail(409,'Complete retained financial source bindings required');const known=new Set(references.map(r=>canonical(r))),seen=new Set<string>(),scopes=new Map<string,any>();
 for(const e of input.evidence){const r=e.reference,key=canonical(r);if(!known.has(key)||seen.has(key))fail(409,'Financial source binding mismatch');seen.add(key);const s=validateEconomicSummary(e.summary,{entityId:r.entityId,installationId:r.installationId,moduleId:r.moduleId});if(r.streamId!=='economic_summaries_v1'||r.revision!==1||r.recordId!==s.summaryId)fail(409,'Financial source binding mismatch');if(r.installationId===installationId){if(r.entityId!==entityId)fail(409,'Financial source entity mismatch');scopes.set(s.sourceModuleId+':'+s.programId,{moduleId:s.sourceModuleId,programId:s.programId,financial:true,economic:true});}}
 if(!scopes.size)fail(409,'No financial programme belongs to the affected installation');return[...scopes.values()];
}
