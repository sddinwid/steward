import type pg from 'pg';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {canonical,digest} from '@steward/module-sdk';
import type {SecureApp,Authentication} from './security/auth.js';
import {fail} from './security/crypto.js';
import {transaction,audit} from './security/store.js';
import type {missionAuthorization} from './mission-routes.js';
export const MISSION_COMPARISON='steward.mission.scenario-comparison';
export const missionComparisonSchema=z.object({comparisonId:z.string().uuid(),scenarioIds:z.array(z.string().uuid()).min(2).max(3).refine(v=>new Set(v).size===v.length)}).strict();
const refSet=(refs:any[])=>canonical(refs.map(r=>canonical(r)).sort());
export function comparableMissionScenarios(rows:any[]){
 if(rows.length<2||rows.length>3||new Set(rows.map(r=>r.scenario_id)).size!==rows.length)fail(400,'Select two or three distinct reviewed scenarios');
 const first=rows[0].request,scope=(r:any)=>canonical({releaseReferences:refSet(r.releaseReferences),allocationReferences:refSet(r.allocationReferences),programId:r.scenario.programId,entityId:r.scenario.entityId,moduleId:r.scenario.moduleId,service:r.scenario.service,currency:r.scenario.currency});
 if(rows.some(r=>scope(r.request)!==scope(first)))fail(422,'Comparison requires the same fixed evidence, target programme, service and currency');
}
function childId(comparisonId:string,scenarioId:string){const bytes=createHash('sha256').update('steward-mission-comparison-v1:'+comparisonId+':'+scenarioId).digest().subarray(0,16);bytes[6]=(bytes[6]!&15)|80;bytes[8]=(bytes[8]!&63)|128;const h=bytes.toString('hex');return[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');}
/** Every retained child remains independently governed, including published history. */
export async function verifyMissionComparison(pool:pg.Pool,row:any,accountId:string,resolve:(account:string,refs:any[],permission?:'read'|'calculate'|'publish')=>Promise<any>,permission:'read'|'calculate'|'publish'='read'){
 if(row.result.capabilityId!==MISSION_COMPARISON)return;
 const links=row.input.comparison?.children,results=row.result.comparisons;
 if(!Array.isArray(links)||links.length<2||links.length>3||!Array.isArray(results)||results.length!==links.length)fail(404,'Comparison evidence unavailable');
 for(const [i,link]of links.entries()){
  const c=(await pool.query('SELECT * FROM mission_calculations WHERE calculation_id=$1',[link.calculationId])).rows[0];
  if(!c||c.created_by!==row.created_by||c.result.capabilityId!== 'steward.mission.sustainability'||refSet(c.source_references)!==refSet(row.source_references)||results[i]?.missionCalculationId!==c.calculation_id||results[i]?.scenarioId!==link.scenarioId||canonical(results[i]?.calculation)!==canonical(c.result))fail(404,'Comparison evidence unavailable');
  await resolve(accountId,c.source_references,permission);
 }
}
export function missionComparisonFindingText(row:any){return 'Synthetic reviewed alternatives; no scenario is an executed decision. '+row.result.comparisons.map((c:any)=>'Scenario '+c.scenarioId+'; retained calculation '+c.missionCalculationId+'; approved available '+c.calculation.displayAmounts.available+'; observed cost '+c.calculation.displayAmounts.cost+'; resource gap '+c.calculation.displayAmounts.gap+'; conditional maximum '+c.calculation.planning.maximumAdditionalUnits+' service units.').join(' ')+' Fixed evidence is shared, never summed across alternatives. Capacity and unit-cost assumptions require independent human review. No funding transfer, reservation, service or eligibility decision is authorized.';}
export async function missionComparisonRoutes(app:SecureApp,pool:pg.Pool,auth:Authentication,access:ReturnType<typeof missionAuthorization>){
 app.post('/api/v13/mission/comparisons',async(req,reply)=>{
  const actor=await auth.session(req,true),parsed=missionComparisonSchema.safeParse(req.body);if(!parsed.success)fail(400,'Two or three distinct reviewed scenario identities are required');const b=parsed.data,requestDigest=digest(canonical(b));
  // Nonblocking cross-process serialization: contention is an explicit safe
  // retry, never another child execution or a pool of blocked transactions.
  const guard=await pool.connect(),lockKey='steward-mission-comparison:'+b.comparisonId;let locked=false;
  try{
  locked=(await guard.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) locked',[lockKey])).rows[0].locked;
  if(!locked)return reply.code(409).send({error:'COMPARISON_IN_PROGRESS'});
  const prior=(await pool.query('SELECT * FROM mission_calculations WHERE calculation_id=$1',[b.comparisonId])).rows[0];
  if(prior){if(prior.created_by!==actor.account_id||prior.request_digest!==requestDigest||prior.result.capabilityId!==MISSION_COMPARISON)fail(409,'Comparison identity conflicts with existing evidence');return{comparison:await access.calculation(actor.account_id,b.comparisonId,'calculate')};}
  async function api(url:string,method:'GET'|'POST'='GET',body?:any){const r=await app.inject({method,url,headers:{cookie:req.headers.cookie!,origin:req.headers.origin!,'x-csrf-token':String(req.headers['x-csrf-token']),...(body?{'content-type':'application/json'}:{})},...(body?{payload:body}:{})});if(r.statusCode!==200)fail(r.statusCode,'Reviewed comparison evidence unavailable');return r.json();}
  // Authorize ALL reviewed alternatives before retaining any new calculation.
  const scenarios=[];for(const id of b.scenarioIds)scenarios.push((await api('/api/v13/mission/scenarios/'+id)).scenario);comparableMissionScenarios(scenarios);
  const children=[];try{for(const scenario of scenarios)children.push({scenarioId:scenario.scenario_id,calculation:(await api('/api/v13/mission/calculations','POST',{...scenario.request,calculationId:childId(b.comparisonId,scenario.scenario_id)})).calculation});}catch(error){await audit(pool,actor.account_id,'mission.comparison.interrupted',b.comparisonId,{retainedCalculationIds:children.map(c=>c.calculation.calculation_id)});throw error;}
  for(const child of children)await access.calculation(actor.account_id,child.calculation.calculation_id,'calculate');
  const first=children[0]!.calculation,input={...first.input,comparison:{version:1,children:children.map(c=>({scenarioId:c.scenarioId,calculationId:c.calculation.calculation_id}))}},result={capabilityId:MISSION_COMPARISON,version:1,status:children.every(c=>c.calculation.result.status==='completed')?'completed':'insufficient-data',synthetic:true,decisionExecuted:false,authoritative:false,programId:first.result.programId,comparisons:children.map(c=>({scenarioId:c.scenarioId,missionCalculationId:c.calculation.calculation_id,calculation:c.calculation.result})),limitations:['Alternatives reuse the same fixed authorized evidence; never sum their money or participants.','Each alternative has its own real deterministic and, where complete, scientific calculation.','No model ranking, commitment, provider substitution or business decision is performed.']};
  return await transaction(pool,async sql=>{const old=(await sql.query('SELECT * FROM mission_calculations WHERE calculation_id=$1',[b.comparisonId])).rows[0];if(old){if(old.created_by!==actor.account_id||old.request_digest!==requestDigest)fail(409,'Comparison identity conflict');return{comparison:old};}const row=(await sql.query('INSERT INTO mission_calculations(calculation_id,created_by,request_digest,source_references,input,result) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[b.comparisonId,actor.account_id,requestDigest,JSON.stringify(first.source_references),input,result])).rows[0];await audit(sql,actor.account_id,'mission.comparison.calculated',b.comparisonId);return{comparison:row};});
  }finally{let destroy=false;if(locked)try{await guard.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[lockKey]);}catch{destroy=true;}guard.release(destroy);}
 });
}
