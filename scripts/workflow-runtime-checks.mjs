import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {canonical,digest,signPackage} from '../packages/module-sdk/dist/index.js';
import {smartMigration} from '../packages/platform/dist/smart-migration.js';
import {workflowMigration} from '../packages/platform/dist/workflow-migration.js';
import {executeSmartStep} from '../packages/module-host/dist/smart-executor.js';
import {graphCommandId} from '../packages/module-host/dist/smart-graph.js';

// Kernel fixture: the actual published Automation definitions and coordinator,
// with an explicitly synthetic provider receipt database. Not Inventory acceptance.
export async function exerciseGraphRuntime(c){
 const {metadata:db,moduleDb,installationId,entityId,author,reviewer,manifest,keys,trust,check,publish,transport}=c;
 await db.query(smartMigration);await db.query(workflowMigration);
 await db.query('CREATE TABLE platform_installation(singleton boolean,installation_id uuid,entity_id uuid)');await db.query('INSERT INTO platform_installation VALUES(true,$1,$2)',[installationId,entityId]);
 const requirement=manifest.smart.consumes[0],providerId='example.workflow-stock',providerInstallation=randomUUID(),bindingId=randomUUID();
 const capability={capabilityId:requirement.capabilityId,contract:requirement.contract,version:'1.0.0',operations:requirement.operations.map(o=>({...o,command:o.name,permission:providerId+'.write',mode:'durable',idempotency:'required',retry:'safe'})),events:[],sensitivity:'business',scope:'entity',ownership:'provider'};
 const provider={...manifest,moduleId:providerId,name:'Synthetic coordinator receipt provider',api:[{operationId:'read',method:'GET',path:'/read',permission:providerId+'.read'},{operationId:'write',method:'POST',path:'/write',permission:providerId+'.write'}],ui:[],configurationSchema:{type:'object',additionalProperties:false,properties:{}},smart:{version:1,provides:[capability],consumes:[],prerequisites:{configuration:{},requiresActive:true,requiresHealthy:true}},integration:{version:1,outboxPath:'/integration-outbox',acknowledgmentPath:'/integration-ack',inboxPath:'/integration-inbox',peers:[]}};
 delete provider.approvalServices;delete provider.workflowServices;delete provider.mcpTools;
 const signed=signPackage({formatVersion:1,publisherId:'test-only',imageId:'sha256:'+'b'.repeat(64),manifest:provider},keys.privateKey.export({type:'pkcs8',format:'pem'}).toString()),providerDigest=digest(canonical(signed));
 await db.query("INSERT INTO module_installations(module_id,version,descriptor,configuration,state,operation_id) VALUES($1,$2,$3,'{}','active',$4)",[providerId,provider.version,signed,providerInstallation]);
 await db.query("INSERT INTO smart_bindings(binding_id,consumer_id,capability_id,provider_id,provider_installation_id,package_digest,requirement,capability,actor_id,entity_id,state,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved','Isolated synthetic kernel fixture approval')",[bindingId,manifest.moduleId,capability.capabilityId,providerId,providerInstallation,providerDigest,requirement,capability,author,entityId]);
 await moduleDb.query('CREATE DATABASE synthetic_provider');const receipts=new pg.Pool({...db.options,password:db.options.password,database:'synthetic_provider'});
 await receipts.query('CREATE TABLE receipts(command_id uuid PRIMARY KEY,digest text NOT NULL,response jsonb NOT NULL)');
 let loseResponse=false,sourceUnavailable=false,providerCalls=0;
 const call=async(id,method,path,body,headers,timeout,incoming)=>{
  if(id===manifest.moduleId&&sourceUnavailable)return{status:503,value:{error:'Synthetic source outage'}};
  if(id!==providerId)return transport(id,method,path,body,headers,timeout);
  providerCalls++;assert.equal(method,'POST');assert.equal(path,'/integration-inbox');assert.equal(incoming.entityId,entityId);assert.equal(incoming.moduleId,manifest.moduleId);
  const hash=digest(canonical(body)),response={orderId:body.payload.orderId,lines:body.payload.lines.map(l=>({sku:l.sku,requested:l.quantity,availableBefore:100,reserved:l.quantity}))};
  await receipts.query('INSERT INTO receipts VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[body.commandId,hash,response]);
  const prior=(await receipts.query('SELECT * FROM receipts WHERE command_id=$1',[body.commandId])).rows[0];assert.equal(prior.digest,hash);
  if(loseResponse){loseResponse=false;throw Error('Synthetic lost response after durable receipt');}
  return{status:200,value:prior.response};
 };
 const base=()=>({graphVersion:1,nodes:[{id:'start',kind:'trigger',label:'Start'},{id:'done',kind:'completion',label:'Done'}],edges:[{from:'start',to:'done',port:'next'}],limits:{elapsedMs:60000,maxParallel:1,maxActions:4}});
 const action=(id='reserve')=>({id,kind:'action',label:'Synthetic receipt',bindingId,operation:'stock.reserve',inputs:{orderId:{literal:randomUUID()},lines:{array:[{object:{sku:{literal:'SYNTHETIC'},quantity:{literal:2}}}]}}});
 const read=async id=>(await db.query('SELECT * FROM smart_executions WHERE execution_id=$1',[id])).rows[0];
 // This isolated transport has no container lifecycle; production passes actual host locks.
 const tick=()=>executeSmartStep(db,installationId,trust,call,async()=>true,async()=>async()=>{});
 async function queue(graph){const pin=await publish(graph),workflowId=randomUUID(),id=randomUUID();await db.query("INSERT INTO smart_workflows(workflow_id,name,version,consumer_id,definition,state,actor_id,reason) VALUES($1,$2,1,$3,$4,'active',$5,'Privileged kernel fixture; no activation API claim')",[workflowId,'fixture-'+workflowId,manifest.moduleId,{format:'module-graph-v1',publication:pin},author]);await db.query("INSERT INTO smart_executions(execution_id,workflow_id,actor_id,digest,inputs,state) VALUES($1,$2,$3,$4,$5,'pending')",[id,workflowId,author,digest(id),{reference:'synthetic manual trigger'}]);return id;}
 async function advance(id,count=12){for(let i=0;i<count;i++){const r=await read(id);if(['completed','suspended'].includes(r.state))return r;await db.query('UPDATE smart_executions SET next_attempt_at=now() WHERE execution_id=$1',[id]);await tick();}return read(id);}
 try{
  await check('graph controls persist and finish through the existing locked coordinator without provider calls',async()=>{const before=providerCalls,id=await queue(base());assert.equal((await advance(id)).state,'completed');assert.equal(providerCalls,before);assert.deepEqual((await read(id)).graph_state.progress.done,{state:'completed',selectedPorts:[]});});
  await check('temporary module publication outage retries without effects and resumes retained progress',async()=>{
   const id=await queue(base()),before=providerCalls;sourceUnavailable=true;try{await tick();const waiting=await read(id);assert.equal(waiting.state,'pending');assert.equal(waiting.error_code,'WORKFLOW_PUBLICATION_UNAVAILABLE');assert.equal(providerCalls,before);}finally{sourceUnavailable=false;}
   const recovered=await advance(id);assert.equal(recovered.state,'completed');assert.equal(recovered.attempts,0);assert.equal(providerCalls,before);
  });
  await check('graph action dispatch reuses SSMA authorization and lost-response retries retain one durable receipt',async()=>{
   const g=base();g.nodes.splice(1,0,action());g.edges=[{from:'start',to:'reserve',port:'next'},{from:'reserve',to:'done',port:'next'}];const id=await queue(g);loseResponse=true;
   const result=await advance(id);assert.equal(result.state,'completed',result.error_code);assert.equal(Number((await receipts.query('SELECT count(*) n FROM receipts WHERE command_id=$1',[graphCommandId(id,'reserve')])).rows[0].n),1);
  });
  await check('concurrent coordinator calls cannot duplicate the same graph action',async()=>{
   const g=base();g.nodes.splice(1,0,action());g.edges=[{from:'start',to:'reserve',port:'next'},{from:'reserve',to:'done',port:'next'}];const id=await queue(g);await tick();await Promise.all([tick(),tick()]);assert.equal((await advance(id)).state,'completed');assert.equal(Number((await receipts.query('SELECT count(*) n FROM receipts WHERE command_id=$1',[graphCommandId(id,'reserve')])).rows[0].n),1);
  });
  await check('condition skips the unselected effect and joins only after both paths settle',async()=>{
   const g=base();g.nodes=[g.nodes[0],{id:'choose',kind:'condition',label:'Choose',condition:{literal:false}},action(),{id:'skip',kind:'wait',label:'No reservation',waitMs:1},{id:'join',kind:'join',label:'Join'},g.nodes[1]];g.edges=[{from:'start',to:'choose',port:'next'},{from:'choose',to:'reserve',port:'true'},{from:'choose',to:'skip',port:'false'},{from:'reserve',to:'join',port:'next'},{from:'skip',to:'join',port:'next'},{from:'join',to:'done',port:'next'}];const before=providerCalls,id=await queue(g),r=await advance(id,20);assert.equal(r.state,'completed',r.error_code);assert.equal(r.graph_state.progress.reserve.state,'skipped');assert.equal(providerCalls,before);
  });
  await check('persisted human waiting requires a separate current reviewer before the consequential action',async()=>{
   const g=base();g.nodes=[g.nodes[0],{id:'approve',kind:'approval',label:'Human decision',approverPermission:'steward.automation.approve',separateInitiator:true,expiresAfterMs:30000},action(),{id:'reject',kind:'completion',label:'Rejected'},{id:'expire',kind:'completion',label:'Expired'},g.nodes[1]];g.edges=[{from:'start',to:'approve',port:'next'},{from:'approve',to:'reserve',port:'approved'},{from:'approve',to:'reject',port:'rejected'},{from:'approve',to:'expire',port:'expired'},{from:'reserve',to:'done',port:'next'}];const id=await queue(g),before=providerCalls;await advance(id,3);assert.equal((await read(id)).graph_state.progress.approve.state,'waiting');assert.equal(providerCalls,before);
   await db.query("INSERT INTO smart_graph_reviews VALUES($1,$2,'approve',$3,'steward.automation.approve','approve','Separate human fixture decision',clock_timestamp())",[randomUUID(),id,reviewer]);const r=await advance(id);assert.equal(r.state,'completed',r.error_code);assert.equal(providerCalls,before+1);
  });
  const approvalGraph=(expiresAfterMs=30000)=>{const g=base();g.nodes=[g.nodes[0],{id:'approve',kind:'approval',label:'Human decision',approverPermission:'steward.automation.approve',separateInitiator:true,expiresAfterMs},action(),{id:'reject',kind:'completion',label:'Rejected'},{id:'expire',kind:'completion',label:'Expired'},g.nodes[1]];g.edges=[{from:'start',to:'approve',port:'next'},{from:'approve',to:'reserve',port:'approved'},{from:'approve',to:'reject',port:'rejected'},{from:'approve',to:'expire',port:'expired'},{from:'reserve',to:'done',port:'next'}];return g;};
  await check('self-approval cannot release a waiting action even for a local administrator',async()=>{
   const id=await queue(approvalGraph()),before=providerCalls;await advance(id,3);
   await db.query("INSERT INTO smart_graph_reviews VALUES($1,$2,'approve',$3,'steward.automation.approve','approve','Invalid self approval fixture',clock_timestamp())",[randomUUID(),id,author]);const r=await advance(id);assert.equal(r.state,'suspended');assert.equal(r.error_code,'WORKFLOW_STEP_APPROVAL_INVALID');assert.equal(providerCalls,before);
  });
  await check('step-reviewer revocation after the approved transition prevents the next effect',async()=>{
   const stepReviewer=randomUUID();await db.query("INSERT INTO security_accounts(account_id,username,password_hash,role) VALUES($1,$2,'unusable-fixture-hash','module_user')",[stepReviewer,'step-'+stepReviewer]);await db.query('INSERT INTO module_permissions VALUES($1,$2,$3)',[stepReviewer,manifest.moduleId,'steward.automation.approve']);
   const id=await queue(approvalGraph()),before=providerCalls;await advance(id,3);await db.query("INSERT INTO smart_graph_reviews VALUES($1,$2,'approve',$3,'steward.automation.approve','approve','Separate step reviewer fixture',clock_timestamp())",[randomUUID(),id,stepReviewer]);await advance(id,1);assert.equal((await read(id)).graph_state.progress.approve.state,'completed');
   await db.query('DELETE FROM module_permissions WHERE account_id=$1',[stepReviewer]);const r=await advance(id);assert.equal(r.state,'suspended');assert.equal(r.error_code,'WORKFLOW_STEP_APPROVER_REVOKED');assert.equal(providerCalls,before);
  });
  await check('actual approval timeout follows the explicit expiry branch without issuing an action',async()=>{
   const id=await queue(approvalGraph(1000)),before=providerCalls;await advance(id,3);await delay(1100);const r=await advance(id,20);assert.equal(r.state,'completed',r.error_code);assert.equal(r.graph_state.progress.expire.state,'completed');assert.equal(r.graph_state.progress.reserve.state,'skipped');assert.equal(providerCalls,before);
  });
  await check('graph effects fail closed without the module lifecycle guard',async()=>{
   const g=base();g.nodes.splice(1,0,action());g.edges=[{from:'start',to:'reserve',port:'next'},{from:'reserve',to:'done',port:'next'}];const id=await queue(g);await tick();const before=providerCalls;await executeSmartStep(db,installationId,trust,call,async()=>true);const r=await read(id);assert.equal(r.state,'suspended');assert.equal(r.error_code,'WORKFLOW_LIFECYCLE_GUARD_REQUIRED');assert.equal(providerCalls,before);
  });
  await check('revoked provider bindings suspend graph actions before any provider effect',async()=>{
   const g=base();g.nodes.splice(1,0,action());g.edges=[{from:'start',to:'reserve',port:'next'},{from:'reserve',to:'done',port:'next'}];const id=await queue(g);await tick();const before=providerCalls;
   try{await db.query("UPDATE smart_bindings SET state='disabled' WHERE binding_id=$1",[bindingId]);const r=await advance(id);assert.equal(r.state,'suspended');assert.equal(r.error_code,'BINDING_REQUIRES_RECONCILIATION');assert.equal(providerCalls,before);}finally{await db.query("UPDATE smart_bindings SET state='approved' WHERE binding_id=$1",[bindingId]);}
  });
 }finally{await receipts.end();}
}
