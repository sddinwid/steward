import {capabilityConfigured} from '@steward/module-sdk';
import type pg from 'pg';
import { canonical, digest, verifyPackage, resolveCapability, validateCapabilityValue, type PublisherTrust, type CapabilityProvider, type CapabilityRequirement } from '@steward/module-sdk';
import type { InstallationConfig } from '@steward/contracts';
import type { Authentication, SecureApp } from './security/auth.js';
import { fail } from './security/crypto.js';
import { audit, transaction } from './security/store.js';
import type { createModuleBroker } from './module-broker.js';

type Broker = Awaited<ReturnType<typeof createModuleBroker>>;
const uuid = { type: 'string', format: 'uuid' };
const identifier = { type: 'string', pattern: '^[a-z][a-z0-9.-]{0,79}$' };
const body = (properties: object, required = Object.keys(properties)) => ({ body: { type: 'object', additionalProperties: false, required, properties } });
export async function smartModuleRoutes(app: SecureApp, pool: pg.Pool, auth: Authentication, identity: InstallationConfig, broker: Broker, trust: () => Promise<PublisherTrust>) {
  async function admin(req: Parameters<Authentication['session']>[0], mutate = false) { const a = await auth.session(req,mutate); if (a.role !== 'local_admin') fail(403,'Worker-local Smart Modules administrator required'); return a; }
  // Governance follows the persisted enrolled legal entity, independently of Master availability.
  async function entityId(){return (await pool.query("SELECT entity_id FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0]?.entity_id??identity.entity.entityId;}
  async function installed() {
    const publishers = await trust();
    return (await pool.query('SELECT * FROM module_installations ORDER BY module_id')).rows.map(row => {
      try { return { ...row, manifest: verifyPackage(row.descriptor,publishers).manifest }; } catch { return { ...row, manifest: null }; }
    });
  }
  async function registry() {
    const rows = await installed(), providers: CapabilityProvider[] = [];
    for (const row of rows) {
      let state: CapabilityProvider['state'] = row.state === 'active' ? 'active' : row.state === 'failed' ? 'failed' : 'inactive';
      if (state === 'active' && row.manifest?.smart?.provides.length) {
        try { if ((await broker('inspect',row.descriptor,row.configuration)).status !== 200) state = 'unavailable'; } catch { state = 'unavailable'; }
      }
      for (const capability of row.manifest?.smart?.provides ?? []) {
        const provider: CapabilityProvider = { moduleId: row.module_id, moduleVersion: row.version, installationId: row.operation_id, entityId: await entityId(), packageDigest: digest(canonical(row.descriptor)), state,
          configured: capabilityConfigured(row.manifest,row.configuration,capability), capability };
        providers.push(provider);
      }
    }
    await transaction(pool,async db => {
      await db.query('SELECT pg_advisory_xact_lock(8080001)');
      await db.query('DELETE FROM smart_providers');
      for (const p of providers) await db.query('INSERT INTO smart_providers(module_id,capability_id,package_digest,installation_id,entity_id,descriptor,state,configured) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[p.moduleId,p.capability.capabilityId,p.packageDigest,p.installationId,p.entityId,p.capability,p.state,p.configured]);
    });
    return { rows, providers };
  }
  function requirement(rows: any[], consumerId: string, capabilityId: string): CapabilityRequirement {
    const consumer = rows.find(r => r.module_id === consumerId);
    if (!consumer?.manifest || consumer.state !== 'active') fail(409,'Consumer is not active or trusted');
    const r = consumer.manifest.smart?.consumes.find((r: CapabilityRequirement) => r.capabilityId === capabilityId);
    if (!r) fail(400,'Consumer does not declare this capability requirement'); return r;
  }
  const privileges = (providers: CapabilityProvider[]) => [...new Set(providers.flatMap(p => p.capability.operations.map(o => o.permission)))];
  let refreshing = false;
  const timer = setInterval(() => { if(refreshing)return;refreshing=true;void registry().catch(()=>{}).finally(()=>{refreshing=false;}); },10000).unref();
  app.addHook('onClose',async()=>{clearInterval(timer);});
  app.get('/api/v8/smart-modules',async req => {
    await admin(req); const { rows,providers } = await registry();
    return { entityId: await entityId(), providers, consumers: rows.filter(r => r.manifest?.smart?.consumes.length).map(r => ({ moduleId:r.module_id, requirements:r.manifest.smart.consumes })),
      bindings:(await pool.query('SELECT * FROM smart_bindings ORDER BY created_at DESC LIMIT 100')).rows,
      workflows:(await pool.query('SELECT * FROM smart_workflows ORDER BY created_at DESC LIMIT 100')).rows,
      executions:(await pool.query('SELECT execution_id,workflow_id,state,step,attempts,error_code,created_at,updated_at FROM smart_executions ORDER BY created_at DESC LIMIT 100')).rows,
      history:(await pool.query('SELECT * FROM smart_history ORDER BY id DESC LIMIT 100')).rows,
      routes:(await pool.query('SELECT command_id,consumer_id,provider_id,capability_id,workflow_id,state,attempts,error_code,created_at,updated_at FROM smart_routes ORDER BY created_at DESC LIMIT 100')).rows };
  });
  app.post<{Body:{consumerId:string;capabilityId:string;preferredProvider?:string}}>('/api/v8/smart-modules/resolve',{schema:body({consumerId:identifier,capabilityId:identifier,preferredProvider:identifier},['consumerId','capabilityId'])},async req => {
    await admin(req,true); const {rows,providers}=await registry(), r=requirement(rows,req.body.consumerId,req.body.capabilityId);
    return resolveCapability(r,providers.filter(p=>p.capability.capabilityId===r.capabilityId),{entityId:await entityId(),permissions:privileges(providers),...(req.body.preferredProvider?{preferredProvider:req.body.preferredProvider}:{})});
  });
  app.post<{Body:{bindingId:string;consumerId:string;capabilityId:string;providerId:string;packageDigest:string;reason:string;preserveExistingObligations?:boolean}}>('/api/v8/smart-modules/bindings',{schema:body({bindingId:uuid,consumerId:identifier,capabilityId:identifier,providerId:identifier,packageDigest:{type:'string',pattern:'^[a-f0-9]{64}$'},reason:{type:'string',minLength:20,maxLength:1000},preserveExistingObligations:{type:'boolean'}},['bindingId','consumerId','capabilityId','providerId','packageDigest','reason'])},async req => {
    const actor=await admin(req,true), b=req.body, {rows,providers}=await registry(), r=requirement(rows,b.consumerId,b.capabilityId);
    const resolved=resolveCapability(r,providers,{entityId:await entityId(),permissions:privileges(providers),preferredProvider:b.providerId});
    if(!resolved.selected || resolved.selected.packageDigest!==b.packageDigest)fail(409,'Provider is incompatible, ambiguous, unavailable or changed; resolve again');
    const p=resolved.selected;
    return transaction(pool,async db=>{
      await db.query('SELECT pg_advisory_xact_lock(8080001)');
      const previous=(await db.query('SELECT * FROM smart_bindings WHERE binding_id=$1',[b.bindingId])).rows[0];
      if(previous){if(previous.consumer_id!==b.consumerId||previous.provider_id!==b.providerId||previous.capability_id!==b.capabilityId||previous.package_digest!==b.packageDigest||previous.actor_id!==actor.account_id||previous.reason!==b.reason)fail(409,'Binding identity was reused');return{binding:previous};}
      // Existing obligations retain their historical binding; no stock or external job is transferred.
      await db.query("UPDATE smart_bindings SET state=$3,reason='Superseded for new work; original obligations remain pinned',updated_at=now(),revision=revision+1 WHERE consumer_id=$1 AND capability_id=$2 AND state='approved'",[b.consumerId,b.capabilityId,b.preserveExistingObligations?'retained':'disabled']);
      const result=await db.query("INSERT INTO smart_bindings(binding_id,consumer_id,capability_id,provider_id,provider_installation_id,package_digest,requirement,capability,actor_id,entity_id,state,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved',$11) RETURNING *",[b.bindingId,b.consumerId,b.capabilityId,b.providerId,p.installationId,p.packageDigest,r,p.capability,actor.account_id,await entityId(),b.reason]);
      await audit(db,actor.account_id,'smart.binding_approved',b.bindingId,{consumer:b.consumerId,provider:b.providerId,capability:b.capabilityId,packageDigest:p.packageDigest}); return{binding:result.rows[0]};
    });
  });
  app.post<{Params:{id:string};Body:{reason:string}}>('/api/v8/smart-modules/bindings/:id/disable',{schema:{params:{type:'object',properties:{id:uuid},required:['id'],additionalProperties:false},...body({reason:{type:'string',minLength:20,maxLength:1000}})}},async req=>{
    const a=await admin(req,true);return transaction(pool,async db=>{const r=await db.query("UPDATE smart_bindings SET state='disabled',reason=$1,revision=revision+1,updated_at=now() WHERE binding_id=$2 RETURNING binding_id",[req.body.reason,req.params.id]);if(!r.rowCount)fail(404,'Binding not found');await audit(db,a.account_id,'smart.binding_disabled',req.params.id);return{disabled:true};});
  });
  // Workflows are data, never scripts. Operations and their schemas come only from signed providers.
  app.post<{Body:{workflowId:string;name:string;version:number;consumerId:string;steps:{bindingId:string;operation:string}[];reason:string}}>('/api/v8/smart-modules/workflows',{schema:body({workflowId:uuid,name:{type:'string',minLength:1,maxLength:100},version:{type:'integer',minimum:1,maximum:10000},consumerId:identifier,steps:{type:'array',minItems:1,maxItems:16,items:{type:'object',additionalProperties:false,required:['bindingId','operation'],properties:{bindingId:uuid,operation:identifier}}},reason:{type:'string',minLength:20,maxLength:1000}})},async req=>{
    const a=await admin(req,true),b=req.body;await registry();
    return transaction(pool,async db=>{
      for(const step of b.steps){const binding=(await db.query("SELECT * FROM smart_bindings WHERE binding_id=$1 AND consumer_id=$2 AND state='approved'",[step.bindingId,b.consumerId])).rows[0];if(!binding||!binding.capability.operations.some((o:any)=>o.name===step.operation))fail(409,'Workflow step requires an approved compatible binding');}
      const definition={steps:b.steps},old=(await db.query('SELECT * FROM smart_workflows WHERE workflow_id=$1',[b.workflowId])).rows[0];
      if(old){if(old.name!==b.name||old.version!==b.version||old.consumer_id!==b.consumerId||canonical(old.definition)!==canonical(definition))fail(409,'Workflow identity was reused');return{workflow:old};}
      const r=await db.query("INSERT INTO smart_workflows(workflow_id,name,version,consumer_id,definition,state,actor_id,reason) VALUES($1,$2,$3,$4,$5,'proposed',$6,$7) RETURNING *",[b.workflowId,b.name,b.version,b.consumerId,definition,a.account_id,b.reason]);
      await db.query("INSERT INTO smart_history(workflow_id,actor_id,event,detail) VALUES($1,$2,'proposed',$3)",[b.workflowId,a.account_id,{version:b.version}]);return{workflow:r.rows[0]};
    });
  });
  app.post<{Params:{id:string};Body:{action:'approve'|'activate'|'disable';reason:string}}>('/api/v8/smart-modules/workflows/:id/lifecycle',{schema:{params:{type:'object',additionalProperties:false,required:['id'],properties:{id:uuid}},...body({action:{type:'string',enum:['approve','activate','disable']},reason:{type:'string',minLength:20,maxLength:1000}})}},async req=>{
    const a=await admin(req,true);return transaction(pool,async db=>{
      await db.query('SELECT pg_advisory_xact_lock(8080001)');
      const w=(await db.query('SELECT * FROM smart_workflows WHERE workflow_id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!w)fail(404,'Workflow not found');
      const next=req.body.action==='approve'?'approved':req.body.action==='activate'?'active':'disabled';
      if(next==='approved'&&w.state!=='proposed'||next==='active'&&w.state!=='approved')fail(409,'Workflow must be proposed, reviewed and approved before activation');
      if(next==='active')await db.query("UPDATE smart_workflows SET accepting_new=false WHERE consumer_id=$1 AND state='active'",[w.consumer_id]);
      await db.query('UPDATE smart_workflows SET state=$1,reason=$2,updated_at=now() WHERE workflow_id=$3',[next,req.body.reason,w.workflow_id]);
      await db.query('INSERT INTO smart_history(workflow_id,actor_id,event,detail) VALUES($1,$2,$3,$4)',[w.workflow_id,a.account_id,next,{reason:req.body.reason}]);return{state:next};
    });
  });
  app.post<{Body:{executionId:string;workflowId:string;inputs:unknown[]}}>('/api/v8/smart-modules/execute',{schema:body({executionId:uuid,workflowId:uuid,inputs:{type:'array',minItems:1,maxItems:16,items:{type:'object'}}})},async req=>{
    const a=await admin(req,true),b=req.body;const {rows,providers}=await registry();
    return transaction(pool,async db=>{
      const w=(await db.query("SELECT * FROM smart_workflows WHERE workflow_id=$1 AND state='active' AND accepting_new FOR UPDATE",[b.workflowId])).rows[0];if(!w)fail(409,'Workflow is not active');
      if(w.definition.steps.length!==b.inputs.length)fail(400,'One input is required per declared step');
      for(let i=0;i<b.inputs.length;i++){
        const step=w.definition.steps[i],binding=(await db.query('SELECT * FROM smart_bindings WHERE binding_id=$1',[step.bindingId])).rows[0];
        if(!binding||binding.state!=='approved')fail(409,'Binding requires reconciliation');
        const r=requirement(rows,w.consumer_id,binding.capability_id),selection=resolveCapability(r,providers,{entityId:await entityId(),permissions:privileges(providers),preferredProvider:binding.provider_id});
        if(!selection.selected||selection.selected.packageDigest!==binding.package_digest)fail(409,'Provider changed or unavailable; review the binding');
        const op=binding.capability.operations.find((o:any)=>o.name===step.operation);try{validateCapabilityValue(b.inputs[i],op.input);}catch{fail(400,'Workflow input does not match its signed schema');}
      }
      const hash=digest(canonical(b)),old=(await db.query('SELECT * FROM smart_executions WHERE execution_id=$1',[b.executionId])).rows[0];
      if(old){if(old.digest!==hash||old.actor_id!==a.account_id)fail(409,'Execution identity was reused');return{executionId:b.executionId,state:old.state};}
      await db.query("INSERT INTO smart_executions(execution_id,workflow_id,actor_id,digest,inputs,state) VALUES($1,$2,$3,$4,$5,'pending')",[b.executionId,b.workflowId,a.account_id,hash,JSON.stringify(b.inputs)]);
      for(const step of w.definition.steps){const binding=(await db.query('SELECT * FROM smart_bindings WHERE binding_id=$1',[step.bindingId])).rows[0];await db.query('INSERT INTO smart_obligations(consumer_id,aggregate_id,capability_id,binding_id,provider_id,package_digest) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[w.consumer_id,b.executionId,binding.capability_id,binding.binding_id,binding.provider_id,binding.package_digest]);}
      await db.query("INSERT INTO smart_history(execution_id,workflow_id,actor_id,event,detail) VALUES($1,$2,$3,'queued','{}')",[b.executionId,b.workflowId,a.account_id]);return{executionId:b.executionId,state:'pending'};
    });
  });
}
