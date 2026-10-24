import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {commerceExceptions,orderProfitability} from '@steward/commerce-kit';
import {commerceProjectionSchema} from './commerce-analysis.js';
import {canonicalBusinessPayload,sourceReference} from './business-analysis.js';
import type {Sql} from './security/store.js';
export const commerceExceptionSchema=z.object({contractVersion:z.literal(1),approved:z.boolean(),active:z.boolean(),sourceId:z.string().uuid(),order:z.string().max(160),code:z.string().regex(/^[a-z_]{1,60}$/),explanation:z.string().max(500),severity:z.enum(['warning','critical'])}).strict();
export const commerceMonitorMigration=`
CREATE TABLE commerce_monitor_policies (
 entity_id uuid PRIMARY KEY REFERENCES legal_entities, enabled boolean NOT NULL DEFAULT false,
 approved_by uuid NOT NULL REFERENCES security_accounts, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE commerce_monitor_conditions (
 installation_id uuid NOT NULL,module_id text NOT NULL,stream_id text NOT NULL,record_id text NOT NULL,code text NOT NULL,
 active boolean NOT NULL,episode integer NOT NULL,finding_id uuid REFERENCES analytical_findings,
 source_revision bigint NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(installation_id,module_id,stream_id,record_id,code)
);
`;
/** Runs in the existing signed synchronization transaction. No external action or model authority. */
export async function monitorCommerce(sql:Sql,row:any) {
 const allowed=(await sql.query(`SELECT 1 FROM commerce_monitor_policies p JOIN security_accounts a ON a.account_id=p.approved_by
 WHERE p.entity_id=$1 AND p.enabled AND a.enabled AND a.role='registry_admin'`,[row.entity_id])).rowCount;
 if(!allowed)return;
 const parsed=commerceProjectionSchema.safeParse(canonicalBusinessPayload(row));
 const p=parsed.success?parsed.data:null;
 const condition=row.stream_id==='commerce_exceptions'?commerceExceptionSchema.safeParse(canonicalBusinessPayload(row)):null;
 const issues=condition?.success&&condition.data.approved&&condition.data.active?[condition.data]:p?commerceExceptions(p):[];
 if(p){const margin=orderProfitability(p);if(margin.contributionMarginBasisPoints!==null&&margin.contributionMarginBasisPoints<2000)issues.push({sourceId:p.sourceId,code:'low_contribution_margin',severity:'warning',explanation:`Contribution margin is ${margin.contributionMarginBasisPoints} basis points (${margin.marginBasis}). Review pricing and supplier evidence; human approval is required for any change.`});}
 // One transaction/condition lock across Workers; timestamps and source revisions never form alert identity.
 await sql.query('SELECT pg_advisory_xact_lock(hashtext($1))',['commerce-monitor:'+row.installation_id+':'+row.module_id+':'+row.stream_id+':'+row.record_id]);
 const old=(await sql.query('SELECT * FROM commerce_monitor_conditions WHERE installation_id=$1 AND module_id=$2 AND record_id=$3 AND stream_id=$4 FOR UPDATE',[row.installation_id,row.module_id,row.record_id,row.stream_id])).rows;
 for(const condition of old.filter(c=>c.active&&!issues.some(i=>i.code===c.code)))await sql.query('UPDATE commerce_monitor_conditions SET active=false,source_revision=$4,updated_at=now() WHERE installation_id=$1 AND module_id=$2 AND record_id=$3 AND code=$5 AND stream_id=$6',[row.installation_id,row.module_id,row.record_id,row.revision,condition.code,row.stream_id]);
 for(const issue of issues){
  const previous=old.find(c=>c.code===issue.code);
  if(previous?.active){await sql.query('UPDATE commerce_monitor_conditions SET source_revision=$4,updated_at=now() WHERE installation_id=$1 AND module_id=$2 AND record_id=$3 AND code=$5 AND stream_id=$6',[row.installation_id,row.module_id,row.record_id,row.revision,issue.code,row.stream_id]);continue;}
  const id=randomUUID(),explanation=`Operational commerce alert: ${issue.code.replaceAll('_',' ')}. ${issue.explanation} Source ${p?p.channel+'/'+p.sourceId:condition?.success?condition.data.order:'Unavailable'}, observed ${row.source_at instanceof Date?row.source_at.toISOString():row.source_at}. This is an observation, not production authorization. Reconcile current provider state before acting.`;
  await sql.query("INSERT INTO analytical_findings(finding_id,severity,explanation,status,supporting_references) VALUES($1,$2,$3,'open',$4)",[id,issue.severity,explanation,JSON.stringify([sourceReference(row)])]);
  await sql.query('INSERT INTO finding_entities VALUES($1,$2)',[id,row.entity_id]);
  await sql.query(`INSERT INTO commerce_monitor_conditions VALUES($1,$2,$8,$3,$4,true,$5,$6,$7,now())
   ON CONFLICT(installation_id,module_id,stream_id,record_id,code) DO UPDATE SET active=true,episode=excluded.episode,finding_id=excluded.finding_id,source_revision=excluded.source_revision,updated_at=now()`,[row.installation_id,row.module_id,row.record_id,issue.code,(previous?.episode??0)+1,id,row.revision,row.stream_id]);
  await sql.query("INSERT INTO security_audit(actor_id,action,target_id,detail) SELECT approved_by,'commerce.alert.created',$2,$3 FROM commerce_monitor_policies WHERE entity_id=$1",[row.entity_id,id,JSON.stringify({code:issue.code,source:sourceReference(row)})]);
 }
}
