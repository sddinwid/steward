import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {canonical,digest} from '@steward/module-sdk';
import {orderProfitability} from '@steward/commerce-kit';
import {simulationEvidence,purchasingOpportunities} from './simulation-analysis.js';
import {sourceReference} from './business-analysis.js';
import type {Sql} from './security/store.js';

export const simulationThresholds=z.object({delaySimulatedSeconds:z.number().int().min(60).max(86400).default(900),minimumMarginBasisPoints:z.number().int().min(-10000).max(10000).default(2000),costIncreaseBasisPoints:z.number().int().min(10001).max(50000).default(12500),demandIncreaseBasisPoints:z.number().int().min(10001).max(50000).default(18000),demandWindowSeconds:z.number().int().min(10).max(3600).default(60),minimumDemandOrders:z.number().int().min(1).max(100).default(3),repeatedExceptions:z.number().int().min(1).max(100).default(3),minimumPurchasingBenefitCents:z.number().int().min(1).max(1e9).default(100)}).strict();
export const simulationPolicySchema=z.object({enabled:z.boolean(),entityIds:z.array(z.string().uuid()).max(20),intervalSeconds:z.number().int().min(5).max(300).default(15),thresholds:simulationThresholds.default(()=>simulationThresholds.parse({}))}).strict();
export const simulationIntelligenceMigration=`
CREATE TABLE simulation_monitor_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL,
 entity_ids uuid[] NOT NULL,approved_by uuid NOT NULL REFERENCES security_accounts,
 interval_seconds integer NOT NULL CHECK(interval_seconds BETWEEN 5 AND 300),thresholds jsonb NOT NULL,
 last_checked_at timestamptz,last_error text,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE simulation_monitor_conditions (
 condition_key text PRIMARY KEY,code text NOT NULL,active boolean NOT NULL,episode integer NOT NULL,
 finding_id uuid REFERENCES analytical_findings,detail jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
`;
type Row=Record<string,any>;
export function simulationConditions(records:Row[],raw:unknown,now=Date.now()){
 const t=simulationThresholds.parse(raw),{runs,orders}=simulationEvidence(records);
 const result:{key:string;code:string;affectedEntities:string[];references:any[];severity:'warning'|'info';detail:Row;explanation:string}[]=[];
 for(const run of runs){
  const cohort=orders.filter(o=>o.owner===run).sort((a,b)=>b.p.orderCreatedAt.localeCompare(a.p.orderCreatedAt)||a.row.record_id.localeCompare(b.row.record_id));
  const recent=cohort.slice(0,4),completed=cohort.filter(o=>o.p.status==='fulfilled').slice(0,8);
  const add=(code:string,selected:typeof orders,detail:Row,explanation:string)=>result.push({key:digest(canonical({dataset:run.p.datasetId,run:run.p.runId,installation:run.row.installation_id,code})),code,affectedEntities:[run.row.entity_id],references:[sourceReference(run.row),...selected.map(o=>sourceReference(o.row))],severity:'warning',detail:{...detail,simulation:{datasetId:run.p.datasetId,runId:run.p.runId,ecosystemId:run.p.ecosystemId},currency:'USD',humanReviewRequired:true},explanation:'SYNTHETIC COMMERCE — '+explanation+' Human review is required; no business action has been executed.'});
  const delayed=recent.filter(o=>{const state=o.p.simulationState;if(!state?.productionRequestedAt||o.p.status==='canceled')return false;const end=state.productionObservedAt?Date.parse(state.productionObservedAt):now;return Math.max(0,(end-Date.parse(state.productionRequestedAt))/1000)*o.p.simulation!.speed>=t.delaySimulatedSeconds;});
  if(delayed.length)add('fulfillment_delay',delayed,{thresholdSimulatedSeconds:t.delaySimulatedSeconds,orders:delayed.map(o=>o.row.record_id),basis:'Real production observation elapsed time multiplied by the source-declared simulation speed; never presented as real elapsed hours.'},'Observed production elapsed time exceeds the configured simulated-duration threshold. Verify capacity and virtual provider progress.');
  const margins=completed.slice(0,4).map(o=>({o,value:orderProfitability(o.p)})).filter(v=>v.value.contributionMarginBasisPoints!==null&&v.value.contributionMarginBasisPoints<t.minimumMarginBasisPoints);
  if(margins.length)add('declining_contribution_margin',margins.map(v=>v.o),{thresholdBasisPoints:t.minimumMarginBasisPoints,orders:margins.map(v=>({recordId:v.o.row.record_id,contributionMarginBasisPoints:v.value.contributionMarginBasisPoints,contributionMarginCents:v.value.contributionMarginCents,basis:v.value.marginBasis}))},'Recent completed source orders have estimated contribution margins below the configured floor. Review pricing, supplier costs, shipping and explicit fees.');
  if(completed.length>=8){const recent4=completed.slice(0,4),prior4=completed.slice(4,8),unit=(a:typeof orders)=>{if(a.some(o=>o.p.productionCostCents===null))return null;const quantity=a.reduce((n,o)=>n+BigInt(o.p.quantity),0n);return quantity?{cost:a.reduce((n,o)=>n+BigInt(o.p.productionCostCents!),0n),quantity}:null;},a=unit(recent4),b=unit(prior4);if(a&&b&&b.cost>0n&&a.cost*b.quantity*10000n>=b.cost*a.quantity*BigInt(t.costIncreaseBasisPoints))add('rising_production_cost',completed,{thresholdBasisPoints:t.costIncreaseBasisPoints,recentCostCents:Number(a.cost),recentQuantity:Number(a.quantity),priorCostCents:Number(b.cost),priorQuantity:Number(b.quantity),basis:'Two consecutive four-completed-order cohorts; product mix may differ and requires review.'},'Estimated production cost per fulfilled unit increased across the two observed cohorts. Product-mix effects and supplier terms remain assumptions to investigate.');}
  const window=t.demandWindowSeconds*1000,current=cohort.filter(o=>Date.parse(o.p.orderCreatedAt)>now-window),prior=cohort.filter(o=>Date.parse(o.p.orderCreatedAt)>now-2*window&&Date.parse(o.p.orderCreatedAt)<=now-window);
  if(prior.length&&current.length>=t.minimumDemandOrders&&current.length*10000>=prior.length*t.demandIncreaseBasisPoints)add('demand_surge',[...current.slice(0,8),...prior.slice(0,8)],{currentCount:current.length,priorCount:prior.length,windowSeconds:t.demandWindowSeconds,thresholdBasisPoints:t.demandIncreaseBasisPoints,basis:'Complete authorized synchronized dataset counts in two real processing-time windows; references show at most eight examples per window.'},'Source order arrivals increased across consecutive observation windows. Check synchronization freshness and distinguish demand growth from delayed ingestion.');
  const shortages=recent.filter(o=>o.p.stockout===true);if(shortages.length)add('inventory_shortage',shortages,{observations:shortages.length,basis:'Source reservation evidence, not scenario selection.'},'Authoritative Stock Ledger reservation evidence shows unavailable requested quantities. Review replenishment and outstanding reservations.');
  const exceptions=cohort.slice(0,8).filter(o=>o.p.simulationState?.reservationFailure||o.p.stockout||o.p.productionStatus==='failed');if(exceptions.length>=t.repeatedExceptions)add('repeated_fulfillment_exceptions',exceptions,{count:exceptions.length,cohortMaximum:8,threshold:t.repeatedExceptions},'Repeated source fulfillment exceptions require review of product mappings, inventory and provider availability.');
 }
 for(const opportunity of purchasingOpportunities(records).filter(o=>o.ecosystemBenefitCents>=t.minimumPurchasingBenefitCents))result.push({key:digest(canonical({key:opportunity.key,runs:opportunity.runIds})),code:'cross_company_purchasing',affectedEntities:opportunity.affectedEntities,references:opportunity.supportingReferences,severity:'info',detail:{...opportunity,humanReviewRequired:true},explanation:`SYNTHETIC COMMERCE — Conditional shared purchasing estimate for ${opportunity.logicalProduct} (${opportunity.variant}), ${opportunity.quantity} observed selected-cohort units. Baseline ${opportunity.displayAmounts.baseline}; proposed including allocated shipping and transition ${opportunity.displayAmounts.proposed}; ecosystem benefit ${opportunity.displayAmounts.benefit}. Internal transfers are zero. Quotes are synthetic estimates; specifications, timing, taxes, supplier terms and all affected entity approvals require human review. No purchase or agreement has been executed.`});
 return result;
}

/** Runs in a bounded Master transaction; only an explicit registry-admin policy grants monitoring. */
export async function monitorSimulation(sql:Sql,force=false,now=Date.now()){
 if(!(await sql.query("SELECT pg_try_advisory_xact_lock(110011) AS acquired")).rows[0]?.acquired)return;
 const policy=(await sql.query(`SELECT p.* FROM simulation_monitor_policy p JOIN security_accounts a ON a.account_id=p.approved_by WHERE p.singleton AND p.enabled AND a.enabled AND a.role='registry_admin' FOR UPDATE OF p`)).rows[0];
 if(!policy||!force&&policy.last_checked_at&&now-Date.parse(policy.last_checked_at)<policy.interval_seconds*1000)return;
 const records=(await sql.query("SELECT * FROM analytical_records WHERE entity_id=ANY($1::uuid[]) AND stream_id IN ('simulation_runs','commerce_orders') ORDER BY entity_id,source_at DESC,record_id LIMIT 10001",[policy.entity_ids])).rows;
 if(records.length>10000)throw Error('SIMULATION_MONITOR_SOURCE_LIMIT');
 const conditions=simulationConditions(records,policy.thresholds,now),keys=conditions.map(c=>c.key);
 await sql.query('UPDATE simulation_monitor_conditions SET active=false,updated_at=now() WHERE active AND NOT(condition_key=ANY($1::text[]))',[keys]);
 for(const c of conditions){
  const old=(await sql.query('SELECT * FROM simulation_monitor_conditions WHERE condition_key=$1 FOR UPDATE',[c.key])).rows[0];
  if(old?.active){await sql.query('UPDATE simulation_monitor_conditions SET detail=$2,updated_at=now() WHERE condition_key=$1',[c.key,c.detail]);continue;}
  const findingId=randomUUID();await sql.query("INSERT INTO analytical_findings(finding_id,severity,explanation,status,supporting_references) VALUES($1,$2,$3,'open',$4)",[findingId,c.severity,c.explanation,JSON.stringify(c.references)]);
  for(const entity of c.affectedEntities)await sql.query('INSERT INTO finding_entities VALUES($1,$2)',[findingId,entity]);
  await sql.query(`INSERT INTO simulation_monitor_conditions VALUES($1,$2,true,$3,$4,$5,now()) ON CONFLICT(condition_key) DO UPDATE SET active=true,episode=excluded.episode,finding_id=excluded.finding_id,detail=excluded.detail,updated_at=now()`,[c.key,c.code,(old?.episode??0)+1,findingId,c.detail]);
  await sql.query("INSERT INTO security_audit(actor_id,action,target_id,detail) VALUES($1,'simulation.monitor.finding',$2,$3)",[policy.approved_by,findingId,{code:c.code,affectedEntities:c.affectedEntities}]);
 }
 await sql.query('UPDATE simulation_monitor_policy SET last_checked_at=to_timestamp($1/1000.0),last_error=NULL WHERE singleton',[now]);
}
