import {capabilityConfigured} from '@steward/module-sdk';
import type pg from 'pg';
import { canonical, digest, verifyPackage, resolveCapability, validateCapabilityValue, type PublisherTrust, type CapabilityProvider, type CapabilityRequirement } from '@steward/module-sdk';
import type { InstallationConfig } from '@steward/contracts';
import type { Authentication, SecureApp } from './security/auth.js';
import { fail } from './security/crypto.js';
import { audit, transaction } from './security/store.js';
import type { createModuleBroker } from './module-broker.js';
import type {createPeerRegistry} from './peer-registry.js';

type Broker = Awaited<ReturnType<typeof createModuleBroker>>;
const uuid = { type: 'string', format: 'uuid' };
const identifier = { type: 'string', pattern: '^[a-z][a-z0-9.-]{0,79}$' };
const body = (properties: object, required = Object.keys(properties)) => ({ body: { type: 'object', additionalProperties: false, required, properties } });
export async function smartModuleRoutes(app: SecureApp, pool: pg.Pool, auth: Authentication, identity: InstallationConfig, broker: Broker, trust: () => Promise<PublisherTrust>,governance?:{peers:ReturnType<typeof createPeerRegistry>;assertProgram:(actorId:string,moduleId:string,programId:string)=>Promise<void>}) {
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
    const remoteProviders:CapabilityProvider[]=[];
    if(governance)for(const r of await governance.peers.providers()){
      try{const manifest=verifyPackage(r.descriptor,await trust()).manifest;
        const peer=(await pool.query("SELECT entity_id FROM smart_peers WHERE installation_id=$1 AND state='approved'",[r.peer_installation_id])).rows[0];if(!peer)continue;
        for(const capability of manifest.smart?.provides??[])remoteProviders.push({moduleId:r.module_id,moduleVersion:manifest.version,installationId:r.provider_installation_id,entityId:peer.entity_id,packageDigest:r.package_digest,state:r.state,configured:r.configured_capabilities.includes(capability.capabilityId),capability});
      }catch{/* Only independently trusted signed packages enter discovery. */}
    }
    return { rows, providers,remoteProviders };
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
    await admin(req); const { rows,providers,remoteProviders } = await registry();
    return { entityId: await entityId(), providers,remoteProviders,peerGrants:(await pool.query("SELECT grant_id,signed_grant->'payload' AS scope FROM smart_peer_grants WHERE state='approved' AND local_side='source' ORDER BY approved_at DESC LIMIT 100")).rows, consumers: rows.filter(r => r.manifest?.smart?.consumes.length).map(r => ({ moduleId:r.module_id, requirements:r.manifest.smart.consumes })),
      bindings:(await pool.query('SELECT * FROM smart_bindings ORDER BY created_at DESC LIMIT 100')).rows,
      workflows:(await pool.query('SELECT * FROM smart_workflows ORDER BY created_at DESC LIMIT 100')).rows,
      executions:(await pool.query('SELECT execution_id,workflow_id,state,step,attempts,error_code,created_at,updated_at FROM smart_executions ORDER BY created_at DESC LIMIT 100')).rows,
      history:(await pool.query('SELECT * FROM smart_history ORDER BY id DESC LIMIT 100')).rows,
      routes:(await pool.query('SELECT command_id,consumer_id,provider_id,capability_id,workflow_id,state,attempts,error_code,created_at,updated_at FROM smart_routes ORDER BY created_at DESC LIMIT 100')).rows };
  });
  app.post<{Body:{consumerId:string;capabilityId:string;preferredProvider?:string;peerGrantId?:string}}>('/api/v8/smart-modules/resolve',{schema:body({consumerId:identifier,capabilityId:identifier,preferredProvider:identifier,peerGrantId:uuid},['consumerId','capabilityId'])},async req => {
    await admin(req,true); const {rows,providers}=await registry(), r=requirement(rows,req.body.consumerId,req.body.capabilityId);
    if(req.body.peerGrantId){
      if(!governance)fail(409,'Peer governance is unavailable');const verified=await governance.peers.grant(req.body.peerGrantId,'source'),g=verified.grant.payload;
      if(g.consumerModuleId!==req.body.consumerId||g.capabilityId!==r.capabilityId||req.body.preferredProvider&&req.body.preferredProvider!==g.providerModuleId)fail(403,'Approved grant does not authorize this capability');
      const provider=verified.destination.providers.find(p=>p.moduleId===g.providerModuleId)!,capability=provider.manifest.smart!.provides.find(c=>c.capabilityId===g.capabilityId)!;
      const remote:CapabilityProvider={moduleId:provider.moduleId,moduleVersion:provider.manifest.version,installationId:provider.providerInstallationId,entityId:g.destinationEntityId,packageDigest:provider.packageDigest,state:provider.state,configured:provider.configuredCapabilities.includes(g.capabilityId),capability};
      return resolveCapability(r,[remote],{entityId:g.destinationEntityId,permissions:privileges([remote])});
    }
    return resolveCapability(r,providers.filter(p=>p.capability.capabilityId===r.capabilityId),{entityId:await entityId(),permissions:privileges(providers),...(req.body.preferredProvider?{preferredProvider:req.body.preferredProvider}:{})});
  });
  app.post<{Body:{bindingId:string;consumerId:string;capabilityId:string;providerId:string;packageDigest:string;reason:string;preserveExistingObligations?:boolean;peerGrantId?:string;sourceProgramId?:string;destinationProgramId?:string;purpose?:string;expiresAt?:string}}>('/api/v8/smart-modules/bindings',{schema:body({bindingId:uuid,consumerId:identifier,capabilityId:identifier,providerId:identifier,packageDigest:{type:'string',pattern:'^[a-f0-9]{64}$'},reason:{type:'string',minLength:20,maxLength:1000},preserveExistingObligations:{type:'boolean'},peerGrantId:uuid,sourceProgramId:uuid,destinationProgramId:uuid,purpose:identifier,expiresAt:{type:'string',format:'date-time'}},['bindingId','consumerId','capabilityId','providerId','packageDigest','reason'])},async req => {
    const actor=await admin(req,true), b=req.body, {rows,providers}=await registry(), r=requirement(rows,b.consumerId,b.capabilityId);
    let candidates=providers,targetEntity=await entityId(),peerId:string|null=null,sourceProgram=b.sourceProgramId??null,destinationProgram=b.destinationProgramId??null,purpose=b.purpose??null,expiry=b.expiresAt??null;
    if(b.peerGrantId){
      if(!governance)fail(409,'Peer governance is unavailable');const v=await governance.peers.grant(b.peerGrantId,'source'),g=v.grant.payload;
      if(g.consumerModuleId!==b.consumerId||g.providerModuleId!==b.providerId||g.capabilityId!==b.capabilityId||g.providerPackageDigest!==b.packageDigest||v.grant.sourceApproval.payload.actorId!==actor.account_id)fail(403,'Reviewed grant does not authorize this binding');
      if(sourceProgram&&sourceProgram!==g.sourceProgramId||destinationProgram&&destinationProgram!==g.destinationProgramId||purpose&&purpose!==g.purpose||expiry&&Date.parse(expiry)!==g.expiresAt)fail(403,'Binding scope differs from the approved grant');
      sourceProgram=g.sourceProgramId;destinationProgram=g.destinationProgramId;purpose=g.purpose;expiry=new Date(g.expiresAt).toISOString();peerId=g.destinationInstallationId;targetEntity=g.destinationEntityId;
      const p=v.destination.providers.find(p=>p.moduleId===g.providerModuleId)!,capability=p.manifest.smart!.provides.find(c=>c.capabilityId===g.capabilityId)!;
      candidates=[{moduleId:p.moduleId,moduleVersion:p.manifest.version,installationId:p.providerInstallationId,entityId:targetEntity,packageDigest:p.packageDigest,state:p.state,configured:p.configuredCapabilities.includes(g.capabilityId),capability}];
    }else if(sourceProgram||destinationProgram||purpose||expiry||rows.find(row=>row.module_id===b.consumerId)?.manifest?.programServices){
      if(!governance||!sourceProgram||!destinationProgram||!purpose||!expiry||Date.parse(expiry)<=Date.now()||Date.parse(expiry)>Date.now()+31*86400000)fail(403,'Explicit programme scopes, purpose and bounded approval expiry are required');
      await governance.assertProgram(actor.account_id,b.consumerId,sourceProgram);await governance.assertProgram(actor.account_id,b.providerId,destinationProgram);
    }
    const resolved=resolveCapability(r,candidates,{entityId:targetEntity,permissions:privileges(candidates),preferredProvider:b.providerId});
    if(!resolved.selected || resolved.selected.packageDigest!==b.packageDigest)fail(409,'Provider is incompatible, ambiguous, unavailable or changed; resolve again');
    const p=resolved.selected;
    return transaction(pool,async db=>{
      await db.query('SELECT pg_advisory_xact_lock(8080001)');
      const previous=(await db.query('SELECT * FROM smart_bindings WHERE binding_id=$1',[b.bindingId])).rows[0];
      if(previous){if(previous.consumer_id!==b.consumerId||previous.provider_id!==b.providerId||previous.capability_id!==b.capabilityId||previous.package_digest!==b.packageDigest||previous.actor_id!==actor.account_id||previous.reason!==b.reason||previous.peer_installation_id!==peerId||previous.peer_grant_id!==(b.peerGrantId??null)||previous.source_program_id!==sourceProgram||previous.destination_program_id!==destinationProgram||previous.purpose!==purpose||(previous.expires_at?new Date(previous.expires_at).toISOString():null)!==(expiry?new Date(expiry).toISOString():null))fail(409,'Binding identity was reused');return{binding:previous};}
      // Existing obligations retain their historical binding; no stock or external job is transferred.
      await db.query("UPDATE smart_bindings SET state=$3,reason='Superseded for new work; original obligations remain pinned',updated_at=now(),revision=revision+1 WHERE consumer_id=$1 AND capability_id=$2 AND source_program_id IS NOT DISTINCT FROM $4::uuid AND destination_program_id IS NOT DISTINCT FROM $5::uuid AND purpose IS NOT DISTINCT FROM $6::text AND state='approved'",[b.consumerId,b.capabilityId,b.preserveExistingObligations?'retained':'disabled',sourceProgram,destinationProgram,purpose]);
      const result=await db.query("INSERT INTO smart_bindings(binding_id,consumer_id,capability_id,provider_id,provider_installation_id,package_digest,requirement,capability,actor_id,entity_id,state,reason,peer_installation_id,peer_grant_id,source_program_id,destination_program_id,purpose,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved',$11,$12,$13,$14,$15,$16,$17) RETURNING *",[b.bindingId,b.consumerId,b.capabilityId,b.providerId,p.installationId,p.packageDigest,r,p.capability,actor.account_id,await entityId(),b.reason,peerId,b.peerGrantId??null,sourceProgram,destinationProgram,purpose,expiry]);
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
      let programme:string|null|undefined;
      for(const step of b.steps){const binding=(await db.query("SELECT * FROM smart_bindings WHERE binding_id=$1 AND consumer_id=$2 AND state='approved'",[step.bindingId,b.consumerId])).rows[0];if(!binding||!binding.capability.operations.some((o:any)=>o.name===step.operation))fail(409,'Workflow step requires an approved compatible binding');
        if(programme!==undefined&&programme!==binding.source_program_id)fail(403,'Workflow steps must share one approved source programme');programme=binding.source_program_id;
        if(binding.source_program_id){if(!governance||new Date(binding.expires_at).getTime()<=Date.now())fail(403,'Current programme approval required');await governance.assertProgram(a.account_id,b.consumerId,binding.source_program_id);if(binding.peer_grant_id){const approved=await governance.peers.grant(binding.peer_grant_id,'source');if(!approved.grant.payload.operations.includes(step.operation))fail(403,'Workflow operation is outside the reviewed peer grant');}}
      }
      const definition={steps:b.steps},old=(await db.query('SELECT * FROM smart_workflows WHERE workflow_id=$1',[b.workflowId])).rows[0];
      if(old){if(old.name!==b.name||old.version!==b.version||old.consumer_id!==b.consumerId||canonical(old.definition)!==canonical(definition))fail(409,'Workflow identity was reused');return{workflow:old};}
      const r=await db.query("INSERT INTO smart_workflows(workflow_id,name,version,consumer_id,definition,state,actor_id,reason,scope_program_id) VALUES($1,$2,$3,$4,$5,'proposed',$6,$7,$8) RETURNING *",[b.workflowId,b.name,b.version,b.consumerId,definition,a.account_id,b.reason,programme??null]);
      await db.query("INSERT INTO smart_history(workflow_id,actor_id,event,detail) VALUES($1,$2,'proposed',$3)",[b.workflowId,a.account_id,{version:b.version}]);return{workflow:r.rows[0]};
    });
  });
  app.post<{Params:{id:string};Body:{action:'approve'|'activate'|'disable';reason:string}}>('/api/v8/smart-modules/workflows/:id/lifecycle',{schema:{params:{type:'object',additionalProperties:false,required:['id'],properties:{id:uuid}},...body({action:{type:'string',enum:['approve','activate','disable']},reason:{type:'string',minLength:20,maxLength:1000}})}},async req=>{
    const a=await admin(req,true);return transaction(pool,async db=>{
      await db.query('SELECT pg_advisory_xact_lock(8080001)');
      const w=(await db.query('SELECT * FROM smart_workflows WHERE workflow_id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!w)fail(404,'Workflow not found');
      const next=req.body.action==='approve'?'approved':req.body.action==='activate'?'active':'disabled';
      if(next==='approved'&&w.state!=='proposed'||next==='active'&&w.state!=='approved')fail(409,'Workflow must be proposed, reviewed and approved before activation');
      if(w.scope_program_id){if(!governance)fail(403,'Programme authority unavailable');await governance.assertProgram(a.account_id,w.consumer_id,w.scope_program_id);}
      if(next==='active')await db.query("UPDATE smart_workflows SET accepting_new=false WHERE consumer_id=$1 AND scope_program_id IS NOT DISTINCT FROM $2::uuid AND state='active'",[w.consumer_id,w.scope_program_id]);
      await db.query('UPDATE smart_workflows SET state=$1,reason=$2,updated_at=now() WHERE workflow_id=$3',[next,req.body.reason,w.workflow_id]);
      await db.query('INSERT INTO smart_history(workflow_id,actor_id,event,detail) VALUES($1,$2,$3,$4)',[w.workflow_id,a.account_id,next,{reason:req.body.reason}]);return{state:next};
    });
  });
  app.post<{Body:{executionId:string;workflowId:string;inputs:unknown[]}}>('/api/v8/smart-modules/execute',{schema:body({executionId:uuid,workflowId:uuid,inputs:{type:'array',minItems:1,maxItems:16,items:{type:'object'}}})},async req=>{
    const a=await admin(req,true),b=req.body;const {rows,providers}=await registry();
    return transaction(pool,async db=>{
      const w=(await db.query("SELECT * FROM smart_workflows WHERE workflow_id=$1 AND state='active' AND accepting_new FOR UPDATE",[b.workflowId])).rows[0];if(!w)fail(409,'Workflow is not active');
      if(w.scope_program_id)fail(409,'Programme service workflows execute through their module-owned durable operations; generic execution is unavailable');
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
