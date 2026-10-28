import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import Fastify from 'fastify';
import {smartMigration} from '../packages/platform/dist/smart-migration.js';
import {commerceMigration,commerceGovernanceMigration} from '../packages/platform/dist/commerce-migration.js';
import {workflowMigration} from '../packages/platform/dist/workflow-migration.js';
import {smartModuleRoutes} from '../packages/platform/dist/smart-modules.js';
import {authentication} from '../packages/platform/dist/security/auth.js';
import {passwordHash} from '../packages/platform/dist/security/crypto.js';
import {executeSmartStep} from '../packages/module-host/dist/smart-executor.js';

export async function exerciseWorkflowGovernance(c){
 const {metadata:db,installationId,entityId,author,reviewer,manifest,trust,transport,verify,publish,check}=c;
 await db.query(smartMigration);await db.query(commerceMigration);await db.query(commerceGovernanceMigration);await db.query(workflowMigration);
 await db.query('CREATE TABLE platform_installation(singleton boolean,installation_id uuid,entity_id uuid)');await db.query('INSERT INTO platform_installation VALUES(true,$1,$2)',[installationId,entityId]);
 const adminPassword=randomBytes(24).toString('base64url'),reviewPassword=randomBytes(24).toString('base64url');
 await db.query('UPDATE security_accounts SET password_hash=$1 WHERE account_id=$2',[await passwordHash(adminPassword),author]);
 await db.query('UPDATE security_accounts SET password_hash=$1 WHERE account_id=$2',[await passwordHash(reviewPassword),reviewer]);
 await db.query('INSERT INTO module_permissions VALUES($1,$2,$3)',[reviewer,manifest.moduleId,'steward.automation.read']);
 const app=Fastify({logger:false}),origin='https://workflow.test',auth=authentication(app,db,origin);
 let brokerCalls=0;
 const broker=async(operation,_descriptor,_config,extra)=>{brokerCalls++;if(operation==='inspect')return{status:200,value:{}};assert.equal(operation,'workflow.verify');try{return{status:200,value:{publication:await verify({pin:extra.publication,actorId:extra.actorId})}};}catch(e){return{status:409,value:{error:e.message}};}};
 await smartModuleRoutes(app,db,auth,{configVersion:1,role:'worker',installationId,entity:{entityId,displayName:'Synthetic governance fixture'}},broker,async()=>trust);
 async function login(username,password){const r=await app.inject({method:'POST',url:'/api/v2/auth/login',headers:{origin},payload:{username,password}});assert.equal(r.statusCode,200,'Fixture authentication failed');return{cookie:String(r.headers['set-cookie']).split(';')[0],csrf:r.json().csrfToken};}
 const admin=await login('fixture-author',adminPassword),human=await login('fixture-reviewer',reviewPassword);
 async function api(method,path,body,status=200,session=admin,csrf=true){const r=await app.inject({method,url:path,headers:{origin,cookie:session.cookie,...(csrf?{'x-csrf-token':session.csrf}:{})},...(body===undefined?{}:{payload:body})});assert.equal(r.statusCode,status,method+' '+path+' returned '+r.statusCode+': '+(r.json().error??r.json().message??'unexpected status'));return r.json();}
 const graph=()=>({graphVersion:1,nodes:[{id:'start',kind:'trigger',label:'Start'},{id:'approve',kind:'approval',label:'Separate human',approverPermission:'steward.automation.approve',separateInitiator:true,expiresAfterMs:30000},{id:'done',kind:'completion',label:'Approved'},{id:'reject',kind:'completion',label:'Rejected'},{id:'expire',kind:'completion',label:'Expired'}],edges:[{from:'start',to:'approve',port:'next'},{from:'approve',to:'done',port:'approved'},{from:'approve',to:'reject',port:'rejected'},{from:'approve',to:'expire',port:'expired'}],limits:{elapsedMs:60000,maxParallel:1,maxActions:1}});
 const reason='Explicit local human governance of a synthetic workflow fixture.';
 const pin=await publish(graph()),workflowId=pin.publicationId,executionId=randomUUID(),input={reference:'governance fixture'};
 const tick=()=>executeSmartStep(db,installationId,trust,transport,async()=>true,async()=>async()=>{});
 const row=async id=>(await db.query('SELECT * FROM smart_executions WHERE execution_id=$1',[id])).rows[0];
 async function advance(id,n=10){for(let i=0;i<n;i++){if(['completed','suspended'].includes((await row(id)).state))break;await db.query('UPDATE smart_executions SET next_attempt_at=now() WHERE execution_id=$1',[id]);await tick();}return row(id);}
 try{
  await check('graph admission uses actual local sessions and CSRF before reaching the module broker',async()=>{
   const before=brokerCalls;await api('POST','/api/v16/workflows/import',{publication:pin,reason},403,human);await api('POST','/api/v16/workflows/import',{publication:pin,reason},403,admin,false);await api('GET','/api/v16/workflows',undefined,403,human);assert.equal(brokerCalls,before);
  });
  await check('exact publication import is idempotent and does not activate the graph',async()=>{
   const result=await api('POST','/api/v16/workflows/import',{publication:pin,reason});assert.equal(result.state,'proposed');assert.equal((await api('POST','/api/v16/workflows/import',{publication:pin,reason})).replayed,true);
   await api('POST','/api/v16/workflows/execute',{workflowId,executionId,input},409);
   await api('POST','/api/v8/smart-modules/workflows/'+workflowId+'/lifecycle',{action:'approve',reason},409);
  });
  await check('reviewed activation and trigger validation preserve one execution identity',async()=>{
   await api('POST','/api/v16/workflows/'+workflowId+'/lifecycle',{action:'activate',reason});
   await api('POST','/api/v16/workflows/execute',{workflowId,executionId,input:{reference:'ok',forged:true}},422);
   const created=await api('POST','/api/v16/workflows/execute',{workflowId,executionId,input});assert.equal(created.replayed,false);assert.equal((await api('POST','/api/v16/workflows/execute',{workflowId,executionId,input})).replayed,true);
   await api('POST','/api/v16/workflows/execute',{workflowId,executionId,input:{reference:'changed'}},409);
   await api('POST','/api/v8/smart-modules/execute',{workflowId,executionId:randomUUID(),inputs:[{}]},409);
   assert.equal(Number((await db.query('SELECT count(*) n FROM smart_executions WHERE execution_id=$1',[executionId])).rows[0].n),1);
  });
  await check('actual human decision endpoint denies self-approval, persists retries and rechecks permission revocation',async()=>{
   await advance(executionId,3);assert.equal((await row(executionId)).graph_state.progress.approve.state,'waiting');
   const decision={reviewId:randomUUID(),nodeId:'approve',decision:'approve',reason};
   await api('POST','/api/v16/workflows/executions/'+executionId+'/reviews',decision,403);
   const approved=await api('POST','/api/v16/workflows/executions/'+executionId+'/reviews',decision,200,human);assert.equal(approved.replayed,false);
   assert.equal((await api('POST','/api/v16/workflows/executions/'+executionId+'/reviews',decision,200,human)).replayed,true);
   await db.query('DELETE FROM module_permissions WHERE account_id=$1 AND permission=$2',[reviewer,'steward.automation.approve']);
   await api('POST','/api/v16/workflows/executions/'+executionId+'/reviews',decision,409,human);
   await db.query('INSERT INTO module_permissions VALUES($1,$2,$3)',[reviewer,manifest.moduleId,'steward.automation.approve']);
   assert.equal((await advance(executionId)).state,'completed');
  });
  await check('cancellation preserves execution and history and never rewrites completed effects',async()=>{
   await api('POST','/api/v16/workflows/executions/'+executionId+'/cancel',{reason},409);
   const id=randomUUID();await api('POST','/api/v16/workflows/execute',{workflowId,executionId:id,input});await advance(id,2);const before=(await row(id)).graph_state;
   const result=await api('POST','/api/v16/workflows/executions/'+id+'/cancel',{reason});assert.equal(result.priorEffectsRetained,true);await tick();assert.equal((await row(id)).error_code,'WORKFLOW_CANCELLED');assert.deepEqual((await row(id)).graph_state,before);
  });
  await check('activating a separate workflow does not disable another module-owned definition',async()=>{
   const other=await publish(graph());await api('POST','/api/v16/workflows/import',{publication:other,reason});await api('POST','/api/v16/workflows/'+other.publicationId+'/lifecycle',{action:'activate',reason});
   assert.equal((await db.query('SELECT accepting_new FROM smart_workflows WHERE workflow_id=$1',[workflowId])).rows[0].accepting_new,true);
   const listed=await api('GET','/api/v16/workflows');assert.equal(listed.workflows.length,2);assert(!JSON.stringify(listed).includes('governance fixture'));assert(!JSON.stringify(listed.executions).includes('observations'));
  });
 }finally{await app.close();}
}
