import {capabilityConfigured} from '@steward/module-sdk';
import {protectSimulationRoute} from './simulation-routing.js';
import type pg from 'pg';
import {canonical,digest,verifyPackage,resolveCapability,validateCommand,validateCapabilityValue,type IntegrationCommand,type ModulePackageManifest,type PublisherTrust,type CapabilityProvider} from '@steward/module-sdk';

/** Resolve once per business obligation, pin each command, revalidate before every delivery. */
export async function routeSmartCommand(pool:pg.Pool,command:IntegrationCommand,source:ModulePackageManifest,trust:PublisherTrust,installationId:string,rejectedSequences?:()=>Promise<number[]>) {
  validateCommand(command);const reference=command.capability;
  if(!reference||command.targetModuleId!=='steward.capability'||command.sourceModuleId!==source.moduleId||command.command!==reference.operation)throw new Error('INTEGRATION_IDENTITY_MISMATCH');
  const requirement=source.smart?.consumes.find(c=>c.capabilityId===reference.capabilityId);
  if(!requirement||!requirement.operations.some(o=>o.name===reference.operation))throw new Error('INTEGRATION_NOT_AUTHORIZED');
  const db=await pool.connect();
  try{
    await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['smart:'+source.moduleId+':'+command.aggregateId]);
    const consumer=(await db.query('SELECT * FROM module_installations WHERE module_id=$1',[source.moduleId])).rows[0];
    if(!consumer||consumer.state!=='active'||canonical(verifyPackage(consumer.descriptor,trust).manifest)!==canonical(source)||!Object.entries(source.smart!.prerequisites.configuration).every(([k,v])=>consumer.configuration[k]===v))throw new Error('INTEGRATION_NOT_AUTHORIZED');
    if(command.simulation&&source.simulation?.role==='participant'&&consumer.configuration.simulationEnabled!==true)throw new Error('INTEGRATION_NOT_AUTHORIZED');
    const local=(await db.query("SELECT COALESCE((SELECT entity_id FROM local_enrollment WHERE singleton AND state='enrolled'),entity_id) AS entity_id FROM platform_installation WHERE singleton AND installation_id=$1",[installationId])).rows[0];if(!local)throw new Error('INTEGRATION_IDENTITY_MISMATCH');
    const pinned=(await db.query('SELECT * FROM smart_obligations WHERE consumer_id=$1 AND aggregate_id=$2 AND capability_id=$3',[source.moduleId,command.aggregateId,reference.capabilityId])).rows[0];
    // An aggregate keeps its reviewed workflow even when later operations use another capability.
    const aggregateWorkflow=pinned?.workflow_id??(await db.query('SELECT workflow_id FROM smart_obligations WHERE consumer_id=$1 AND aggregate_id=$2 AND workflow_id IS NOT NULL LIMIT 1',[source.moduleId,command.aggregateId])).rows[0]?.workflow_id;
    const policies=(await db.query("SELECT * FROM smart_workflows WHERE consumer_id=$1 AND state='active' AND (($2::uuid IS NULL AND accepting_new) OR workflow_id=$2)",[source.moduleId,aggregateWorkflow??null])).rows;
    const candidates=[];
    for(const policy of policies)for(const step of policy.definition.steps){
      if(step.operation!==reference.operation)continue;
      const candidate=(await db.query('SELECT * FROM smart_bindings WHERE binding_id=$1 AND consumer_id=$2 AND capability_id=$3',[step.bindingId,source.moduleId,reference.capabilityId])).rows[0];
      if(candidate&&(!pinned||candidate.binding_id===pinned.binding_id))candidates.push({policy,binding:candidate});
    }
    if(candidates.length!==1)throw new Error('INTEGRATION_WORKFLOW_APPROVAL_REQUIRED');
    const {policy,binding}=candidates[0]!,workflowId=policy.workflow_id;
    if(!binding||!(binding.state==='approved'||(aggregateWorkflow&&binding.state==='retained'))||binding.entity_id!==local.entity_id||canonical(binding.requirement)!==canonical(requirement))throw new Error('INTEGRATION_APPROVAL_REQUIRED');
    if(!(await db.query("SELECT 1 FROM security_accounts WHERE account_id=$1 AND enabled AND role='local_admin'",[binding.actor_id])).rowCount)throw new Error('INTEGRATION_APPROVAL_REVOKED');
    const row=(await db.query('SELECT * FROM module_installations WHERE module_id=$1',[binding.provider_id])).rows[0];
    if(!row||row.state!=='active')throw new Error('INTEGRATION_PROVIDER_UNAVAILABLE');
    const manifest=verifyPackage(row.descriptor,trust).manifest,capability=manifest.smart?.provides.find(c=>c.capabilityId===reference.capabilityId);
    if(!capability||binding.provider_installation_id!==row.operation_id||binding.package_digest!==digest(canonical(row.descriptor)))throw new Error('INTEGRATION_PROVIDER_CHANGED');
    await protectSimulationRoute(db,command,source,manifest,row.configuration);
    const p:CapabilityProvider={moduleId:row.module_id,moduleVersion:row.version,installationId:row.operation_id,entityId:local.entity_id,packageDigest:binding.package_digest,state:'active',configured:capabilityConfigured(manifest,row.configuration,capability),capability};
    if(!resolveCapability(requirement,[p],{entityId:local.entity_id,permissions:capability.operations.map(o=>o.permission)}).selected)throw new Error('INTEGRATION_NOT_AUTHORIZED');
    const operation=capability.operations.find(o=>o.name===reference.operation&&o.mode==='durable');if(!operation||operation.retry!=='safe')throw new Error('INTEGRATION_DURABLE_SAFE_RECEIPT_REQUIRED');
    validateCapabilityValue(command.payload,operation.input);
    if(!pinned)await db.query('INSERT INTO smart_obligations(consumer_id,aggregate_id,capability_id,binding_id,provider_id,package_digest,workflow_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[source.moduleId,command.aggregateId,reference.capabilityId,binding.binding_id,row.module_id,binding.package_digest,workflowId]);
    const hash=digest(canonical(command)),previous=(await db.query('SELECT * FROM smart_routes WHERE command_id=$1',[command.commandId])).rows[0];
    let routed:IntegrationCommand;
    if(previous){if(previous.digest!==hash||previous.binding_id!==binding.binding_id)throw new Error('INTEGRATION_IDENTITY_MISMATCH');routed=previous.envelope;}
    else{
      const prior=Number((await db.query('SELECT COALESCE(max(source_sequence),0) n FROM smart_routes WHERE consumer_id=$1 AND aggregate_id=$2 AND capability_id=$3',[source.moduleId,command.aggregateId,reference.capabilityId])).rows[0].n);
      if(command.sequence!==prior+1){
        const skipped=rejectedSequences?await rejectedSequences():[];
        if(command.sequence<=prior||command.sequence-prior>1000||!Array.from({length:command.sequence-prior-1},(_,i)=>prior+i+1).every(n=>skipped.includes(n)))throw new Error('INTEGRATION_SEQUENCE_GAP');
      }
      const n=Number((await db.query("SELECT COALESCE(max((envelope->>'sequence')::bigint),0) n FROM smart_routes WHERE consumer_id=$1 AND aggregate_id=$2 AND provider_id=$3",[source.moduleId,command.aggregateId,row.module_id])).rows[0].n);
      routed={...command,targetModuleId:row.module_id,command:operation.command,sequence:n+1};validateCommand(routed);
      await db.query('INSERT INTO smart_routes(command_id,digest,consumer_id,aggregate_id,provider_id,binding_id,capability_id,source_sequence,envelope,workflow_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[command.commandId,hash,source.moduleId,command.aggregateId,row.module_id,binding.binding_id,reference.capabilityId,command.sequence,routed,workflowId]);
    }
    await db.query('COMMIT');return{command:routed,operation,manifest};
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
