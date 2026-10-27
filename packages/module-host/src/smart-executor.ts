import {atLeast,capabilityConfigured,consumerCapabilityConfigured} from '@steward/module-sdk';
import {protectSimulationRoute,recordSimulationDenial} from './simulation-routing.js';
import type pg from 'pg';
import { canonical,digest,verifyPackage,resolveCapability,validateCapabilityValue,INTEGRATION_PROTOCOL,type PublisherTrust,type IntegrationCommand,type CapabilityProvider } from '@steward/module-sdk';

type Call = (id:string,method:string,path:string,body?:unknown,context?:Record<string,string>,timeout?:number,incomingIdentity?:Record<string,string>)=>Promise<{status:number;value:any}>;
// Stable command IDs survive process death between a provider commit and coordinator commit.
export function workflowCommandId(executionId:string,step:number) { const h=digest('steward-smart-step-v1:'+executionId+':'+step);return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`; }
export async function executeSmartStep(pool:pg.Pool,installationId:string,trust:PublisherTrust,call:Call,runtimeMatches:(id:string,configuration:unknown)=>Promise<boolean>) {
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    const e=(await db.query("SELECT * FROM smart_executions WHERE state IN ('pending','running') AND next_attempt_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
    if(!e){await db.query('COMMIT');return;}
    const w=(await db.query('SELECT * FROM smart_workflows WHERE workflow_id=$1',[e.workflow_id])).rows[0];
    const history=async(event:string,detail:unknown)=>db.query('INSERT INTO smart_history(execution_id,workflow_id,actor_id,event,detail) VALUES($1,$2,$3,$4,$5)',[e.execution_id,e.workflow_id,e.actor_id,event,detail]);
    const suspend=async(code:string)=>{await db.query("UPDATE smart_executions SET state='suspended',error_code=$1,updated_at=now() WHERE execution_id=$2",[code,e.execution_id]);await history('suspended',{code,step:e.step,recovery:'Inspect original provider receipts and business state. Reconcile retained obligations explicitly; never transfer reservations or repeat uncertain paid production.'});};
    let retrySafe = false, issued = false;
    try {
      if(!w||w.state!=='active')throw new Error('WORKFLOW_NOT_ACTIVE');
      if(Date.now()-new Date(e.created_at).getTime()>600000)throw new Error('WORKFLOW_TIME_BUDGET');
      if(!(await db.query("SELECT 1 FROM security_accounts WHERE account_id=$1 AND enabled AND role='local_admin'",[e.actor_id])).rowCount)throw new Error('AUTHORIZATION_REVOKED');
      const step=w.definition.steps[e.step];if(!step)throw new Error('INVALID_WORKFLOW_STEP');
      const binding=(await db.query("SELECT * FROM smart_bindings WHERE binding_id=$1 AND consumer_id=$2 AND state IN ('approved','retained')",[step.bindingId,w.consumer_id])).rows[0];
      if(!binding)throw new Error('BINDING_REQUIRES_RECONCILIATION');
      const local=(await db.query("SELECT COALESCE((SELECT entity_id FROM local_enrollment WHERE singleton AND state='enrolled'),entity_id) AS entity_id FROM platform_installation WHERE singleton AND installation_id=$1",[installationId])).rows[0];
      if(!local||binding.entity_id!==local.entity_id)throw new Error('ENTITY_SCOPE_MISMATCH');
      if(!(await db.query("SELECT 1 FROM security_accounts WHERE account_id=$1 AND enabled AND role='local_admin'",[binding.actor_id])).rowCount)throw new Error('APPROVAL_REVOKED');
      const rows=(await db.query('SELECT * FROM module_installations WHERE module_id=ANY($1::text[])',[ [w.consumer_id,binding.provider_id] ])).rows;
      const source=rows.find(r=>r.module_id===w.consumer_id),target=rows.find(r=>r.module_id===binding.provider_id);
      if(!source||!target||source.state!=='active'||target.state!=='active')throw new Error('PROVIDER_UNAVAILABLE');
      if(binding.provider_installation_id!==target.operation_id)throw new Error('PROVIDER_REINSTALLED_REVIEW_REQUIRED');
      const verified=(descriptor:Parameters<typeof verifyPackage>[0])=>{try{return verifyPackage(descriptor,trust).manifest;}catch{throw new Error('PACKAGE_TRUST_REVOKED');}};
      const sm=verified(source.descriptor),tm=verified(target.descriptor);
      if(digest(canonical(target.descriptor))!==binding.package_digest)throw new Error('PROVIDER_UPGRADED_REVIEW_REQUIRED');
      const requirement=sm.smart?.consumes.find(r=>r.capabilityId===binding.capability_id),capability=tm.smart?.provides.find(c=>c.capabilityId===binding.capability_id);
      if(!requirement||canonical(requirement)!==canonical(binding.requirement)||!capability)throw new Error('CONTRACT_CHANGED_REVIEW_REQUIRED');
      if(!Object.entries(sm.smart!.prerequisites.configuration).every(([k,v])=>source.configuration[k]===v))throw new Error('CONSUMER_CONFIGURATION_PREREQUISITE');
      if(!consumerCapabilityConfigured(sm,source.configuration,requirement))throw new Error('CONSUMER_CONFIGURATION_PREREQUISITE');
      const p:CapabilityProvider={moduleId:tm.moduleId,moduleVersion:tm.version,installationId:target.operation_id,entityId:binding.entity_id,packageDigest:binding.package_digest,state:'active',configured:capabilityConfigured(tm,target.configuration,capability),capability};
      if(!resolveCapability(requirement,[p],{entityId:binding.entity_id,permissions:capability.operations.map(o=>o.permission)}).selected)throw new Error('INCOMPATIBLE_PROVIDER');
      if(!await runtimeMatches(tm.moduleId,target.configuration)||!await runtimeMatches(sm.moduleId,source.configuration))throw new Error('CONFIGURATION_MISMATCH');
      const op=capability.operations.find(o=>o.name===step.operation);if(!op)throw new Error('OPERATION_NOT_DECLARED');
      retrySafe = op.retry === 'safe';
      if(sm.simulation?.role==='participant'&&source.configuration.integrationsEnabled!==true)throw Error('CONSUMER_CONFIGURATION_PREREQUISITE');
      const input=e.inputs[e.step];validateCapabilityValue(input,op.input);
      const commandId=workflowCommandId(e.execution_id,e.step);
      // A coordinator transaction may roll back after a provider commit. The same
      // command identity is reused; non-repeatable operations require reconciliation.
      await db.query("UPDATE smart_executions SET state='running',attempts=attempts+1,updated_at=now() WHERE execution_id=$1",[e.execution_id]);
      let response;
      if(!retrySafe){
        // This issuance marker is committed independently. A killed process can
        // never blindly repeat an external operation after losing its response.
        const receipt=(await pool.query('SELECT * FROM smart_attempts WHERE command_id=$1',[commandId])).rows[0];
        if(receipt?.state==='issued')throw new Error('UNCERTAIN_OUTCOME_RECONCILE');
        if(receipt?.state==='responded')response=receipt.response;
        else await pool.query("INSERT INTO smart_attempts(command_id,execution_id,step,state) VALUES($1,$2,$3,'issued')",[commandId,e.execution_id,e.step]);
      }
      issued = true;
      if(!response&&op.mode==='durable'){
        if(!tm.integration)throw new Error('DURABLE_ENDPOINT_MISSING');
        let sequence=1;
        for(let i=0;i<e.step;i++){const prior=(await db.query('SELECT provider_id FROM smart_bindings WHERE binding_id=$1',[w.definition.steps[i].bindingId])).rows[0];if(prior?.provider_id===target.module_id)sequence++;}
        const envelope:IntegrationCommand={protocol:INTEGRATION_PROTOCOL,commandId,sourceModuleId:sm.moduleId,targetModuleId:tm.moduleId,command:op.command,version:1,aggregateId:e.execution_id,sequence,occurredAt:new Date(e.created_at).toISOString(),payload:input,...(atLeast(tm.minimumPlatformVersion,'0.15.0')?{capability:{capabilityId:capability.capabilityId,operation:op.name}}:{})};
        await protectSimulationRoute(db,envelope,sm,tm,target.configuration);
        response=await call(tm.moduleId,'POST',tm.integration.inboxPath,envelope,{'x-steward-integration-source':sm.moduleId,'x-steward-installation':installationId,'x-steward-capability':capability.capabilityId},4000,{workerInstallationId:installationId,entityId:binding.entity_id,moduleId:sm.moduleId,moduleInstallationId:source.operation_id,packageDigest:digest(canonical(source.descriptor))});
      }else if(!response){
        const api=tm.api.find(a=>a.operationId===op.command&&!a.path.includes(':'));
        if(!api||api.permission!==op.permission)throw new Error('SYNC_ENDPOINT_MISSING');
        await protectSimulationRoute(db,{protocol:INTEGRATION_PROTOCOL,commandId,sourceModuleId:sm.moduleId,targetModuleId:tm.moduleId,command:op.command,version:1,aggregateId:e.execution_id,sequence:e.step+1,occurredAt:new Date(e.created_at).toISOString(),payload:input},sm,tm,target.configuration);
        response=await call(tm.moduleId,api.method,api.path,api.method==='GET'?undefined:{...input,requestId:commandId},{'x-steward-actor':e.actor_id,'x-steward-permissions':JSON.stringify([op.permission]),'x-steward-installation':installationId},4000);
      }
      if(!retrySafe)await pool.query("UPDATE smart_attempts SET state='responded',response=$1,updated_at=now() WHERE command_id=$2",[response,commandId]);
      if(response.status>=200&&response.status<300){
        validateCapabilityValue(response.value,op.output);
        const completed=e.step+1===w.definition.steps.length;
        await db.query("UPDATE smart_executions SET state=$1,step=step+1,attempts=0,error_code=NULL,next_attempt_at=now(),updated_at=now() WHERE execution_id=$2",[completed?'completed':'pending',e.execution_id]);
        await history('step_completed',{step:e.step,bindingId:binding.binding_id,provider:tm.moduleId,packageDigest:binding.package_digest,commandId,result:response.value,completed});
      }else if([400,401,403,409,422].includes(response.status))await suspend('PROVIDER_REJECTED');
      else if(op.retry==='reconcile')await suspend('UNCERTAIN_OUTCOME_RECONCILE');
      else throw new Error('PROVIDER_UNAVAILABLE');
    }catch(error){
      const raw=(error as Error).message,code=/^[A-Z_]{1,80}$/.test(raw)?raw:'PROVIDER_UNAVAILABLE';
      // Durable inbox receipts make transport retries safe, with a strict attempt budget.
      if(code==='PROVIDER_UNAVAILABLE'&&(!issued||retrySafe)&&e.attempts<3){await db.query("UPDATE smart_executions SET state='pending',attempts=$1,error_code=$2,next_attempt_at=now()+interval '5 seconds',updated_at=now() WHERE execution_id=$3",[e.attempts+1,code,e.execution_id]);await history('retry_scheduled',{step:e.step,code});}
      else await suspend(code==='PROVIDER_UNAVAILABLE'&&issued&&!retrySafe?'UNCERTAIN_OUTCOME_RECONCILE':code);
    }
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
