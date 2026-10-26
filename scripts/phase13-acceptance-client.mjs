// Shared deployed acceptance client. No database writes and no credentials in
// section state. Default to the actual selected operator deployment.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rename,rmdir,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {canonical,digest,verifyPackage} from '../packages/module-sdk/dist/index.js';
if(!process.argv[2]){const selection=JSON.parse(await readFile('.steward/operator/selection.json','utf8'));assert(selection.directory,'Selected operator deployment is required');process.argv[2]=selection.directory;}
const client=await import('./phase4-client.mjs'),lib=await import('./lib.mjs');
export const{api,logins,credentials,deployment,origin,sessions,waitFor}=client;
export const{directory,docker,compose,sql}=lib;
const states=new Map();
export async function sectionState(section){assert(/^[a-z0-9-]{1,40}$/i.test(section),'Safe section name required');const key=section.toLowerCase();if(states.has(key))return states.get(key);const file=path.join(directory,'demo/phase13-'+key+'.json');await mkdir(path.dirname(file),{recursive:true});const state=existsSync(file)?JSON.parse(await readFile(file,'utf8')):{version:1};assert.equal(state.version,1);const persist=async()=>{const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(state,null,2)+'\n',{mode:0o600});await rename(temporary,file);};const value={state,persist,file};states.set(key,value);return value;}
export function workerIdentity(worker){const value=deployment.instances.find(i=>i.key===worker&&i.role==='worker');assert(value,'Known Worker installation required');return value;}
export function entityId(worker){workerIdentity(worker);const value=sql(worker,"SELECT entity_id FROM local_enrollment WHERE singleton AND state='enrolled'").trim();assert(/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(value),'An actually enrolled entity is required');return value;}
export async function moduleApi(worker,moduleId,url,method='GET',body,status=200){const exactBody=body===undefined?undefined:structuredClone(body);for(let attempt=0;;attempt++){try{return(await api(worker,'/api/v3/modules/'+moduleId+'/api'+url,method,exactBody,status)).value;}catch(e){if(attempt>=8||!String(e.message).includes('received 409 (OPERATION_IN_PROGRESS)'))throw e;await new Promise(resolve=>setTimeout(resolve,Math.min(1000,250*(attempt+1))));}}}
export async function installed(worker,moduleId){return(await api(worker,'/api/v3/modules')).value.installed.find(m=>m.moduleId===moduleId);}
export async function records(worker,moduleId,url){const rows=[];for(let offset=0;offset<=10000;offset+=20){const page=await moduleApi(worker,moduleId,url+(url.includes('?')?'&':'?')+'limit=20&offset='+offset);assert(Array.isArray(page.records));rows.push(...page.records);if(page.records.length<20)return rows;}throw new Error('Acceptance record collection exceeded its bounded scope');}
export async function seedRecord(worker,moduleId,url,key,body,options={}){const keyField=options.keyField??('number'in body?'number':'reference'in body&&!('code'in body)?'reference':'code'),programme=options.programId??body.programId;let record=(await records(worker,moduleId,url)).find(r=>r[keyField]===key&&(!programme||r.programId===programme));if(!record)record=(await moduleApi(worker,moduleId,url,'POST',body,201)).record;assert(record,'Created synthetic record is required');return record;}
export async function action(worker,moduleId,url,record,options={}){return moduleApi(worker,moduleId,url+'/'+record.id,'POST',{revision:record.revision,requestId:options.requestId??randomUUID()});}
export function migrationCompatible(current,candidate){return!current||current.manifest.persistence.migrations.every(old=>candidate.manifest.persistence.migrations.some(next=>next.version===old.version&&next.sha256===old.sha256));}
export async function ensureInstalled(worker,moduleId,version,configuration){
 const manager=(await api(worker,'/api/v3/modules')).value,candidate=manager.available.find(p=>p.packageId===moduleId+'@'+version);assert(candidate?.trusted&&candidate?.compatible,'Signed compatible '+moduleId+'@'+version+' must already be published by the release operator');
 let current=manager.installed.find(m=>m.moduleId===moduleId);const desired={...(current?.configuration??{}),...configuration};
 assert(migrationCompatible(current,candidate),'Historical module migration hashes do not match the new signed package; do not rewrite applied migrations or force a reinstall');
 if(current?.configuration?.serviceAuthorityProgramId&&configuration.serviceAuthorityProgramId&&current.configuration.serviceAuthorityProgramId!==configuration.serviceAuthorityProgramId)throw new Error('Preserve the existing explicitly configured private authority programme; do not silently replace it');
 if(!current||current.version!==version||current.state==='failed'){
  await api(worker,'/api/v3/modules/install','POST',{packageId:moduleId+'@'+version,operationId:current?.state==='failed'&&current.version===version?current.operationId:randomUUID(),configuration:desired,...(current&&current.version!==version?{upgrade:true}:{}),...(current?.state==='failed'&&current.version===version?{recover:true}:{})});
  current=await waitFor(async()=>{const r=await installed(worker,moduleId);return r?.version===version&&r.state!=='installing'?r:null;},'actual '+moduleId+' installation');
 }else if(canonical(current.configuration)!==canonical(desired)){
  await api(worker,'/api/v3/modules/'+moduleId+'/configuration','PUT',{configuration:desired});current=await installed(worker,moduleId);
 }
 assert.equal(current.version,version);assert.notEqual(current.state,'failed','Module installation failed: '+current.errorCode);
 if(current.state!=='active'){await api(worker,'/api/v3/modules/'+moduleId+'/lifecycle','POST',{action:'activate'});current=await waitFor(async()=>{const r=await installed(worker,moduleId);return r.state==='active'?r:null;},moduleId+' activation');}return current;
}
async function catalogue(){return{catalog:JSON.parse(await readFile(path.join(directory,'modules/public/catalog.json'),'utf8')),trust:JSON.parse(await readFile(path.join(directory,'modules/public/trust.json'),'utf8')),ca:await readFile(path.join(directory,'security/ca-cert.pem'),'utf8')};}
async function importPeers(source,destination,trust,ca){for(const [local,remote]of [[source,destination],[destination,source]]){const profile=(await api(remote,'/api/v13/peer-services/profile')).value.profile;await api(local,'/api/v13/peer-services/peers','POST',{profile,pins:{installationId:workerIdentity(remote).installationId,entityId:entityId(remote),origin:origin(remote),tlsCaPem:ca,publisherTrust:trust,transport:'docker-host-localhost'}});}}
/** Approval automation uses only existing signed SSMA APIs and actual local
 * administrators. All identities/CA/publisher pins originate independently in
 * the selected operator installation, never the offered remote profile. */
export async function ensurePeerWorkflow(options){
 assert(/^[a-z0-9-]{1,40}$/i.test(options.section));assert(/^[a-z0-9.-]{1,80}$/i.test(options.key));
 const governanceName='routes-'+digest([options.source,options.consumerId,options.sourceProgramId].join(':')).slice(0,24),lock=path.join(directory,'demo/phase13-'+governanceName+'.json.lock');await mkdir(path.dirname(lock),{recursive:true});
 const until=Date.now()+45000;for(;;){try{await mkdir(lock);break;}catch(e){if(e.code!=='EEXIST'||Date.now()>=until)throw new Error('Programme acceptance governance is busy; no approval state was changed. Retry after the active script finishes.');await new Promise(resolve=>setTimeout(resolve,250));}}
 try{states.delete(governanceName);return await ensurePeerWorkflowLocked(options,governanceName);}finally{await rmdir(lock);}
}
async function ensurePeerWorkflowLocked(options,governanceName){
 const {section,source,destination,consumerId,providerId,sourceProgramId,destinationProgramId,capabilityId,operations,purpose,authorityReference}=options,key=section+':'+options.key;
 assert(Array.isArray(operations)&&operations.length&&operations.length<=12);assert(sessions[source]?.account&&sessions[destination]?.account,'Sign in actual local administrators first');
 const own=await sectionState(governanceName),state=own.state;state.peerWorkflows??={};state.workflowGroups??={};
 const groupKey=[source,consumerId,sourceProgramId].join(':');
 // Import prior section-local governance once, without touching case-state files
 // or replacing their approved identities/payloads. All subsequent callers use
 // this same per-consumer/programme ledger, regardless of acceptance checkpoint.
 for(const file of await readdir(path.join(directory,'demo'))){const match=/^phase13-([a-z0-9-]+)\.json$/i.exec(file);if(!match||match[1].startsWith('routes-'))continue;const legacy=JSON.parse(await readFile(path.join(directory,'demo',file),'utf8'));
  for(const[legacyKey,value]of Object.entries(legacy.peerWorkflows??{})){if(value.source!==source||value.consumerId!==consumerId||value.sourceProgramId!==sourceProgramId)continue;const importedKey=match[1]+':'+legacyKey,old=state.peerWorkflows[importedKey];if(old){assert.equal(canonical(old.payload),canonical(value.payload),'Legacy peer approval scope changed');assert.equal(old.bindingId,value.bindingId,'Legacy binding identity changed');}else state.peerWorkflows[importedKey]=value;}
  const group=legacy.workflowGroups?.[groupKey],old=state.workflowGroups[groupKey];if(group&&(!old||group.version>old.version))state.workflowGroups[groupKey]=group;
 }await own.persist();
 const consumer=await installed(source,consumerId),provider=await installed(destination,providerId);assert.equal(consumer?.state,'active');assert.equal(provider?.state,'active');
 const {catalog,trust,ca}=await catalogue(),packageFor=(id,version)=>{const p=catalog.packages.find(p=>p.payload.manifest.moduleId===id&&p.payload.manifest.version===version);assert(p,'Verified package in selected catalogue');verifyPackage(p,trust);return p;};
 const consumerPackage=packageFor(consumerId,consumer.version),providerPackage=packageFor(providerId,provider.version);assert.equal(provider.imageId,providerPackage.payload.imageId);assert.equal(consumer.imageId,consumerPackage.payload.imageId);
 if(source!==destination)await importPeers(source,destination,trust,ca);
 const scopes={sourceInstallationId:workerIdentity(source).installationId,sourceEntityId:entityId(source),sourceProgramId,consumerModuleId:consumerId,consumerInstallationId:consumer.operationId,consumerPackageDigest:digest(canonical(consumerPackage)),destinationInstallationId:workerIdentity(destination).installationId,destinationEntityId:entityId(destination),destinationProgramId,providerModuleId:providerId,providerInstallationId:provider.operationId,providerPackageDigest:digest(canonical(providerPackage)),capabilityId,operations,purpose,maximumSensitivity:options.maximumSensitivity??'restricted',disclosureBasis:options.disclosureBasis??'synthetic-consent',authorityReference};
 const local=source===destination;
 let entry=state.peerWorkflows[key];if(!entry){const bindingId=randomUUID();entry=state.peerWorkflows[key]={authorizationType:local?'local-binding':'bilateral-peer-grant',grantId:local?bindingId:randomUUID(),bindingId,source,destination,consumerId,sourceProgramId,operations:[...operations],reason:options.reason??'Synthetic Phase 13 reviewed service purpose, explicit programme authority and pinned provider identity',payload:{version:1,kind:local?'local-ssma-binding':'ssma-peer-grant',...scopes,notBefore:Date.now()-1000,expiresAt:Date.now()+7*86400000}};entry.payload.grantId=entry.grantId;await own.persist();}
 else{const{version,kind,grantId,notBefore,expiresAt,...old}=entry.payload;assert.equal(canonical(old),canonical(scopes),'Frozen peer approval scope or package changed; review a new explicit section key instead of substituting or renewing');assert(entry.payload.expiresAt>Date.now(),'Frozen peer approval expired; explicit new grant key and review required');}
 assert.equal(entry.payload.kind,local?'local-ssma-binding':'ssma-peer-grant','Do not replace a local approval with a remote grant or change deployment identity');
 if(local){
  // Actual local SSMA approval, not an invented enrollment/profile or signature.
  // grantId is only a metadata alias for this binding ID in local ACK evidence.
  await api(source,'/api/v8/smart-modules/bindings','POST',{bindingId:entry.bindingId,consumerId,capabilityId,providerId,packageDigest:scopes.providerPackageDigest,reason:entry.reason,sourceProgramId,destinationProgramId,purpose,expiresAt:new Date(entry.payload.expiresAt).toISOString(),preserveExistingObligations:true});entry.bindingApproved=true;await own.persist();
 }else{
  if(!entry.proposal){entry.proposal=(await api(source,'/api/v13/peer-services/grants/propose','POST',entry.payload)).value;await own.persist();}
  if(!entry.signed){entry.signed=(await api(destination,'/api/v13/peer-services/grants/countersign','POST',entry.proposal)).value;await own.persist();}
  await api(source,'/api/v13/peer-services/grants/approve','POST',entry.signed);
  await api(source,'/api/v8/smart-modules/bindings','POST',{bindingId:entry.bindingId,consumerId,capabilityId,providerId,packageDigest:scopes.providerPackageDigest,reason:entry.reason,peerGrantId:entry.grantId,preserveExistingObligations:true});entry.bindingApproved=true;await own.persist();
 }
 // One reviewed workflow per consumer/programme, unioning ONLY this section's
 // explicitly approved capability operations. New versions retain old work.
 // Historical obligations keep their original approvals. They cannot become
 // active steps of a newly installed consumer merely because its module ID is
 // unchanged. Only this exact installation/package's explicit grants compose.
 const entries=Object.entries(state.peerWorkflows).filter(([,v])=>v.source===source&&v.consumerId===consumerId&&v.sourceProgramId===sourceProgramId&&v.payload.consumerInstallationId===scopes.consumerInstallationId&&v.payload.consumerPackageDigest===scopes.consumerPackageDigest&&(v.bindingApproved||v.signed)).sort(([a],[b])=>a.localeCompare(b)),steps=entries.flatMap(([,v])=>v.operations.map(operation=>({bindingId:v.bindingId,operation})));assert(steps.length<=16,'Explicit workflow exceeds 16 reviewed operations');
 let group=state.workflowGroups[groupKey];if(!group||canonical(group.steps)!==canonical(steps)){const previous=group;group=state.workflowGroups[groupKey]={workflowId:randomUUID(),version:(previous?.version??0)+1,steps,name:('P13 '+section+' '+consumerId+' '+sourceProgramId.slice(0,8)).slice(0,100),reason:'Synthetic Phase 13 explicit review of all programme service bindings and bounded operations',previousWorkflowIds:[...(previous?.previousWorkflowIds??[]),...(previous?[previous.workflowId]:[])]};await own.persist();}
 await api(source,'/api/v8/smart-modules/workflows','POST',{workflowId:group.workflowId,name:group.name,version:group.version,consumerId,steps:group.steps,reason:group.reason});
 let current=(await api(source,'/api/v8/smart-modules')).value.workflows.find(w=>w.workflow_id===group.workflowId);assert(current);
 if(current.state==='proposed'){await api(source,'/api/v8/smart-modules/workflows/'+group.workflowId+'/lifecycle','POST',{action:'approve',reason:group.reason});current={...current,state:'approved'};}
 if(current.state==='approved')await api(source,'/api/v8/smart-modules/workflows/'+group.workflowId+'/lifecycle','POST',{action:'activate',reason:group.reason});else assert.equal(current.state,'active','Do not silently re-enable a disabled workflow');
 for(const[,v]of entries)v.workflowId=group.workflowId;await own.persist();return{grantId:entry.grantId,bindingId:entry.bindingId,workflowId:group.workflowId,payload:entry.payload,provider,consumer};
}
