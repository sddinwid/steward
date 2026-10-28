import Fastify from 'fastify';
import {smartModuleRoutes} from '../packages/platform/dist/smart-modules.js';
import {authentication} from '../packages/platform/dist/security/auth.js';
import {passwordHash} from '../packages/platform/dist/security/crypto.js';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {canonical,digest,signPackage} from '../packages/module-sdk/dist/index.js';
import {smartMigration} from '../packages/platform/dist/smart-migration.js';
import {commerceMigration,commerceGovernanceMigration} from '../packages/platform/dist/commerce-migration.js';
import {workflowMigration} from '../packages/platform/dist/workflow-migration.js';
import {sharedEventMigration} from '../packages/platform/dist/shared-event-migration.js';
import {registerWorkflowSubscription} from '../packages/module-host/dist/workflow-event-admission.js';
import {verifyWorkflowPublication} from '../packages/module-host/dist/workflow-authority.js';
import {executeSmartStep} from '../packages/module-host/dist/smart-executor.js';

// Real authoritative publication/review API and PostgreSQL admission. Activation,
// binding and lifecycle guard below are explicit fixtures, not deployment proof.
export async function exerciseWorkflowEventAdmission(c){
 const {metadata:db,manifest,keys,trust,installationId,entityId,author,reviewer,publish,transport,check}=c;
 for(const sql of [smartMigration,commerceMigration,commerceGovernanceMigration,workflowMigration,sharedEventMigration])await db.query(sql);
 await db.query('CREATE TABLE platform_installation(singleton boolean,installation_id uuid,entity_id uuid)');await db.query('INSERT INTO platform_installation VALUES(true,$1,$2)',[installationId,entityId]);
 const requirement=manifest.smart.consumes.find(c=>c.capabilityId==='fixture.stock.observe'),empty={type:'object',additionalProperties:false,properties:{}};
 const provider={manifestVersion:1,sdkVersion:1,moduleId:'fixture.stock-source',version:'1.0.0',name:'Synthetic stock event source',description:'Isolated event admission fixture',minimumPlatformVersion:'0.16.0',dependencies:[],requiredPermissions:['storage.own-database'],api:[{operationId:'observe',method:'GET',path:'/stock',permission:'fixture.stock-source.read'}],ui:[],configurationSchema:empty,persistence:{isolation:'dedicated-database',schemaVersion:1,migrations:[{version:1,sha256:'b'.repeat(64)}],destructiveRollback:false},integrationEvents:[],analyticalCapabilities:[],replication:{contractVersion:1,streams:[{streamId:'stock',table:'stock',idColumn:'id',revisionColumn:'revision',columns:['id','revision','item_id','quantity']}]},smart:{version:1,provides:[{capabilityId:requirement.capabilityId,contract:requirement.contract,version:'1.0.0',operations:[{...requirement.operations[0],command:'observe',permission:'fixture.stock-source.read',mode:'sync',idempotency:'required',retry:'safe'}],events:requirement.events.map(e=>({...e,streamId:'stock'})),sensitivity:'business',scope:'entity',ownership:'provider'}],consumes:[],prerequisites:{configuration:{},requiresActive:true,requiresHealthy:true}}};
 const descriptor=signPackage({formatVersion:1,publisherId:'test-only',imageId:'sha256:'+'b'.repeat(64),manifest:provider},keys.privateKey.export({type:'pkcs8',format:'pem'}).toString()),providerInstallation=randomUUID(),binding=randomUUID(),subscription=randomUUID();
 await db.query("INSERT INTO module_installations(module_id,version,descriptor,configuration,state,operation_id) VALUES($1,'1.0.0',$2,'{}','active',$3)",[provider.moduleId,descriptor,providerInstallation]);
 await db.query("INSERT INTO smart_bindings(binding_id,consumer_id,capability_id,provider_id,provider_installation_id,package_digest,requirement,capability,actor_id,entity_id,state,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved','Explicit isolated event source fixture')",[binding,manifest.moduleId,requirement.capabilityId,provider.moduleId,providerInstallation,digest(canonical(descriptor)),requirement,provider.smart.provides[0],author,entityId]);
 const graph={graphVersion:1,nodes:[{id:'start',kind:'trigger',label:'Event'},{id:'done',kind:'completion',label:'Done'}],edges:[{from:'start',to:'done',port:'next'}],limits:{elapsedMs:60000,maxParallel:1,maxActions:1}},pin=await publish(graph),workflow=pin.publicationId;
 await db.query("INSERT INTO smart_workflows(workflow_id,name,version,consumer_id,definition,state,actor_id,reason) VALUES($1,'event-fixture',1,$2,$3,'active',$4,'Explicit isolated activation fixture')",[workflow,manifest.moduleId,{format:'module-graph-v1',publication:pin},author]);
 const scope={installationId,entityId,trust},request={workflowId:workflow,subscriptionId:subscription,consumerId:manifest.moduleId,actorId:author,reason:'Explicit source-event subscription for an isolated fixture.'};
 let guards=0,releases=0;
 const guard=async ids=>{assert.deepEqual([...ids].sort(),[manifest.moduleId,provider.moduleId].sort());guards++;return async()=>{releases++;};};
 const register=(overrides={},runtime=async()=>true,call=transport)=>registerWorkflowSubscription(db,scope,call,runtime,guard,{...request,...overrides});
 await check('exact reviewed event publication admits one governed subscriber and retries do not create another',async()=>{
  const publication=await verifyWorkflowPublication(db,trust,transport,async()=>true,{pin,installationId,entityId,actorId:author});assert.equal(publication.trigger.kind,'event');
  assert.equal((await register()).replayed,false);assert.equal((await register()).replayed,true);assert.equal((await db.query('SELECT count(*) n FROM smart_event_subscriptions')).rows[0].n,'1');assert.equal(guards,releases);
  const s=(await db.query('SELECT * FROM smart_event_subscriptions')).rows[0];assert.equal(s.source_module_installation_id,providerInstallation);assert.equal(s.binding_revision,1);assert.equal(s.source_package_digest,digest(canonical(descriptor)));assert.deepEqual(s.event_schema,requirement.events[0].schema);
 });
 await check('another subscriber identity cannot duplicate the same workflow and source event subscription',async()=>{
  await assert.rejects(register({subscriptionId:randomUUID()}),/EVENT_SUBSCRIPTION_IDENTITY_CONFLICT/);assert.equal((await db.query('SELECT count(*) n FROM smart_event_subscriptions')).rows[0].n,'1');assert.equal(guards,releases);
 });
 await check('current binding approval, actor authority, entity and runtime configuration are mandatory',async()=>{
  await db.query("UPDATE smart_bindings SET state='disabled' WHERE binding_id=$1",[binding]);await assert.rejects(register(),/EVENT_SOURCE_BINDING_REQUIRED/);await db.query("UPDATE smart_bindings SET state='approved' WHERE binding_id=$1",[binding]);
  await assert.rejects(register({actorId:reviewer}),/WORKFLOW_REQUESTER_AUTHORITY_REVOKED/);
  await db.query('INSERT INTO module_permissions VALUES($1,$2,$3)',[reviewer,manifest.moduleId,manifest.moduleId+'.read']);
  try{await assert.rejects(register({actorId:reviewer}),/EVENT_APPROVER_REVOKED/);}finally{await db.query('DELETE FROM module_permissions WHERE account_id=$1 AND permission=$2',[reviewer,manifest.moduleId+'.read']);}
  await assert.rejects(register({},async id=>id!==provider.moduleId),/EVENT_SOURCE_UNAVAILABLE/);
  await assert.rejects(registerWorkflowSubscription(db,{...scope,entityId:randomUUID()},transport,async()=>true,guard,request),/WORKFLOW_PUBLICATION_SCOPE_MISMATCH/);assert.equal(guards,releases);
 });
 await check('review revocation during lifecycle acquisition is rechecked before subscriber admission',async()=>{
  const permission=manifest.approvalServices.reviewerPermission;
  try{await assert.rejects(registerWorkflowSubscription(db,scope,transport,async()=>true,async()=>{await db.query('DELETE FROM module_permissions WHERE account_id=$1 AND permission=$2',[reviewer,permission]);return async()=>{};},request),/WORKFLOW_REVIEWER_AUTHORITY_REVOKED/);}finally{await db.query('INSERT INTO module_permissions VALUES($1,$2,$3)',[reviewer,manifest.moduleId,permission]);}
 });
 await check('an event publication cannot execute through an invented manual execution without a delivery receipt',async()=>{
  const execution=randomUUID();await db.query("INSERT INTO smart_executions(execution_id,workflow_id,actor_id,digest,inputs,state) VALUES($1,$2,$3,$4,$5,'pending')",[execution,workflow,author,'a'.repeat(64),{id:randomUUID(),revision:1,item_id:randomUUID(),quantity:5}]);
  await executeSmartStep(db,installationId,trust,transport,async()=>true,guard);const e=(await db.query('SELECT state,error_code FROM smart_executions WHERE execution_id=$1',[execution])).rows[0];assert.equal(e.state,'suspended');assert.equal(e.error_code,'WORKFLOW_EVENT_ADMISSION_REQUIRED');
 });
 await check('real Worker sessions and CSRF govern event import, activation, subscriber admission and minimized status',async()=>{
  const app=Fastify({logger:false}),origin='https://events.test',auth=authentication(app,db,origin),password=randomBytes(24).toString('base64url');let brokerCalls=0;
  await db.query('UPDATE security_accounts SET password_hash=$1 WHERE account_id=ANY($2::uuid[])',[await passwordHash(password),[author,reviewer]]);
  const broker=async(operation,_descriptor,_configuration,extra)=>{brokerCalls++;if(operation==='inspect')return{status:200,value:{}};try{
   if(operation==='workflow.verify')return{status:200,value:{publication:await verifyWorkflowPublication(db,trust,transport,async()=>true,{pin:extra.publication,actorId:extra.actorId,installationId,entityId})}};
   assert.equal(operation,'workflow.subscribe');return{status:200,value:await registerWorkflowSubscription(db,scope,transport,async()=>true,guard,{...extra,consumerId:manifest.moduleId})};
  }catch(e){return{status:409,value:{error:e.message}};}};
  await smartModuleRoutes(app,db,auth,{configVersion:1,role:'worker',installationId,entity:{entityId,displayName:'Synthetic event governance fixture'}},broker,async()=>trust);
  async function login(username){const r=await app.inject({method:'POST',url:'/api/v2/auth/login',headers:{origin},payload:{username,password}});assert.equal(r.statusCode,200);return{cookie:String(r.headers['set-cookie']).split(';')[0],csrf:r.json().csrfToken};}
  const admin=await login('fixture-author'),moduleUser=await login('fixture-reviewer');
  async function api(method,url,payload,status=200,session=admin,csrf=true){const r=await app.inject({method,url,headers:{origin,cookie:session.cookie,...(csrf?{'x-csrf-token':session.csrf}:{})},...(payload===undefined?{}:{payload})});assert.equal(r.statusCode,status,r.body);return r.json();}
  try{
   const next=await publish(graph),body={workflowId:next.publicationId,subscriptionId:randomUUID(),reason:request.reason},before=brokerCalls;
   await api('POST','/api/v16/workflows/event-subscriptions',body,403,moduleUser);await api('POST','/api/v16/workflows/event-subscriptions',body,403,admin,false);assert.equal(brokerCalls,before);
   await api('POST','/api/v16/workflows/import',{publication:next,reason:request.reason});await api('POST','/api/v16/workflows/'+next.publicationId+'/lifecycle',{action:'activate',reason:request.reason});
   const admitted=await api('POST','/api/v16/workflows/event-subscriptions',body);assert.equal(admitted.subscriptionId,body.subscriptionId);assert.equal(admitted.replayed,false);assert.equal((await api('POST','/api/v16/workflows/event-subscriptions',body)).replayed,true);
   await api('POST','/api/v16/workflows/execute',{workflowId:next.publicationId,executionId:randomUUID(),input:{id:randomUUID(),revision:1,item_id:randomUUID(),quantity:5}},409);
   const status=await api('GET','/api/v16/workflows/event-subscriptions');assert.equal(status.subscriptions.length,2);assert(status.subscriptions.every(s=>!Object.hasOwn(s,'event_schema')));assert(status.deliveries.every(d=>!Object.hasOwn(d,'envelope')));await api('GET','/api/v16/workflows/event-subscriptions',undefined,403,moduleUser);
  }finally{await app.close();}
 });

}
