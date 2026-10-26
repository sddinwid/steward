import {capabilityConfigured} from '@steward/module-sdk';
import {protectSimulationRoute} from './simulation-routing.js';
import type pg from 'pg';
import {canonical,digest,verifyPackage,resolveCapability,validateCommand,validateCapabilityValue,type IntegrationCommand,type ModulePackageManifest,type PublisherTrust,type CapabilityProvider} from '@steward/module-sdk';

/** Resolve once per business obligation, pin each command, revalidate before every delivery. */
export async function routeSmartCommand(pool:pg.Pool,command:IntegrationCommand,source:ModulePackageManifest,trust:PublisherTrust,installationId:string,rejectedSequences?:()=>Promise<number[]>,authorizeProgram?:(actorId:string,moduleId:string,programId:string)=>Promise<void>,authorizeDispatch?:(actorId:string,command:IntegrationCommand,audience:Record<string,string>)=>Promise<void>) {
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
    const programScope=typeof command.payload.sourceProgramId==='string'?command.payload.sourceProgramId:null;
    const policies=(await db.query("SELECT * FROM smart_workflows WHERE consumer_id=$1 AND state='active' AND (($2::uuid IS NULL AND accepting_new AND scope_program_id IS NOT DISTINCT FROM $3::uuid) OR workflow_id=$2)",[source.moduleId,aggregateWorkflow??null,programScope])).rows;
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
    if(binding.source_program_id){
      if(binding.source_program_id!==programScope||binding.destination_program_id!==command.payload.programId||new Date(binding.expires_at).getTime()<=Date.now()||!authorizeProgram)throw new Error('INTEGRATION_PROGRAM_APPROVAL_REQUIRED');
      await authorizeProgram(binding.actor_id,source.moduleId,binding.source_program_id);
      if(!binding.peer_installation_id)await authorizeProgram(binding.actor_id,binding.provider_id,binding.destination_program_id);
    }else if(source.programServices)throw new Error('INTEGRATION_PROGRAM_APPROVAL_REQUIRED');
    const remote=binding.peer_installation_id?{peerInstallationId:binding.peer_installation_id as string,grantId:binding.peer_grant_id as string}:null;
    const row=remote?(await db.query(`SELECT p.module_id,p.provider_installation_id operation_id,p.descriptor,p.state,
      p.configured_capabilities,p.package_digest FROM smart_peer_providers p JOIN smart_peers w ON w.installation_id=p.peer_installation_id
      JOIN smart_peer_grants g ON g.grant_id=$5
      WHERE p.peer_installation_id=$1 AND p.module_id=$2 AND p.provider_installation_id=$3 AND p.package_digest=$4 AND w.state='approved' AND g.state='approved'`,[remote.peerInstallationId,binding.provider_id,binding.provider_installation_id,binding.package_digest,remote.grantId])).rows[0]
      :(await db.query('SELECT * FROM module_installations WHERE module_id=$1',[binding.provider_id])).rows[0];
    if(!row||row.state!=='active')throw new Error('INTEGRATION_PROVIDER_UNAVAILABLE');
    const manifest=verifyPackage(row.descriptor,trust).manifest,capability=manifest.smart?.provides.find(c=>c.capabilityId===reference.capabilityId);
    if(!capability||binding.provider_installation_id!==row.operation_id||binding.package_digest!==digest(canonical(row.descriptor)))throw new Error('INTEGRATION_PROVIDER_CHANGED');
    if(!remote)await protectSimulationRoute(db,command,source,manifest,row.configuration);
    // Remote entity scope is admitted only by the persisted bilateral grant;
    // the public API coordinator verifies that grant again before dispatch.
    const grant=remote?(await db.query("SELECT signed_grant FROM smart_peer_grants WHERE grant_id=$1 AND state='approved'",[remote.grantId])).rows[0]?.signed_grant:null;
    const g=grant?.payload;
    if(remote&&(!g||g.sourceInstallationId!==installationId||g.sourceEntityId!==local.entity_id||g.destinationInstallationId!==remote.peerInstallationId||g.consumerModuleId!==source.moduleId||g.consumerInstallationId!==consumer.operation_id||g.consumerPackageDigest!==digest(canonical(consumer.descriptor))||g.providerModuleId!==row.module_id||g.providerInstallationId!==row.operation_id||g.providerPackageDigest!==binding.package_digest||g.sourceProgramId!==binding.source_program_id||g.destinationProgramId!==binding.destination_program_id||g.purpose!==binding.purpose||g.capabilityId!==reference.capabilityId||!g.operations.includes(reference.operation)||g.expiresAt<=Date.now()))throw new Error('INTEGRATION_APPROVAL_REVOKED');
    const targetEntity=remote?g.destinationEntityId:local.entity_id;
    if(source.programServices){
      if(!authorizeDispatch)throw new Error('INTEGRATION_PROGRAM_APPROVAL_REQUIRED');
      await authorizeDispatch(binding.actor_id,command,{sourceProgramId:binding.source_program_id,destinationProgramId:binding.destination_program_id,destinationInstallationId:remote?.peerInstallationId??installationId,destinationEntityId:targetEntity,providerModuleId:row.module_id});
    }
    const p:CapabilityProvider={moduleId:row.module_id,moduleVersion:manifest.version,installationId:row.operation_id,entityId:targetEntity,packageDigest:binding.package_digest,state:'active',configured:remote?row.configured_capabilities.includes(capability.capabilityId):capabilityConfigured(manifest,row.configuration,capability),capability};
    if(!resolveCapability(requirement,[p],{entityId:targetEntity,permissions:capability.operations.map(o=>o.permission)}).selected)throw new Error('INTEGRATION_NOT_AUTHORIZED');
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
      const n=Number((await db.query("SELECT COALESCE(max((envelope->>'sequence')::bigint),0) n FROM smart_routes WHERE consumer_id=$1 AND aggregate_id=$2 AND provider_id=$3 AND peer_installation_id IS NOT DISTINCT FROM $4::uuid",[source.moduleId,command.aggregateId,row.module_id,remote?.peerInstallationId??null])).rows[0].n);
      routed={...command,targetModuleId:row.module_id,command:operation.command,sequence:n+1};validateCommand(routed);
      await db.query('INSERT INTO smart_routes(command_id,digest,consumer_id,aggregate_id,provider_id,binding_id,capability_id,source_sequence,envelope,workflow_id,peer_installation_id,peer_grant_id,original_envelope) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[command.commandId,hash,source.moduleId,command.aggregateId,row.module_id,binding.binding_id,reference.capabilityId,command.sequence,routed,workflowId,remote?.peerInstallationId??null,remote?.grantId??null,command]);
    }
    const scope=binding.source_program_id&&!remote?{sourceEntityId:local.entity_id,sourceInstallationId:installationId,sourceProgramId:binding.source_program_id,destinationEntityId:local.entity_id,destinationInstallationId:installationId,destinationProgramId:binding.destination_program_id,consumerModuleId:source.moduleId,purpose:binding.purpose,grantId:binding.binding_id,providerInstallationId:row.operation_id,packageDigest:binding.package_digest,expiresAt:new Date(binding.expires_at).getTime(),sourceActorId:binding.actor_id,destinationActorId:binding.actor_id}:null;
    await db.query('COMMIT');return{command:routed,operation,manifest,remote,scope};
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
