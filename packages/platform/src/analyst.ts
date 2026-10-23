import { canonical } from '@steward/module-sdk';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type pg from 'pg';
import type { SecureApp, Authentication } from './security/auth.js';
import type { SecurityConfig } from './security/config.js';
import { audit } from './security/store.js';
import { fail } from './security/crypto.js';
import { createModel, modelConfigSchema, tlsFetch } from './analyst-model.js';
import { AGENT_ID } from './mcp.js';
import { agentProof } from './mcp-agent-identity.js';
import { compactToolNames, modelToolResult } from './analyst-context.js';
import {profileInstructions,profileTools,type InvestigationProfile} from './investigation-profiles.js';

export const narrativeSchema=z.object({narrative:z.string().min(1).max(6000),assumptions:z.array(z.string().max(1000)).max(20),humanDecisions:z.array(z.string().max(1000)).min(1).max(20)}).strict();
export function parseNarrative(text:string){
  const trimmed=text.trim();const fenced=/^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return narrativeSchema.parse(JSON.parse(fenced?fenced[1]!:trimmed));
}
export async function analystRoutes(app:SecureApp,pool:pg.Pool,auth:Authentication,security:SecurityConfig){
  // Recover honestly after process death; never imply an unfinished run completed.
  await pool.query("UPDATE analyst_investigations SET status='interrupted',error_code='PROCESS_RESTARTED',updated_at=now() WHERE status='running'");
  let running=0;const controllers=new Set<AbortController>();
  app.addHook('onClose',async()=>{for(const c of controllers)c.abort();});
  async function actor(req:any,mutate=false){const a=await auth.session(req,mutate);if(!['registry_admin','enrollment_admin'].includes(a.role))fail(403,'Analytical administrator required');return a;}
  async function owned(req:any){const a=await actor(req);const row=(await pool.query('SELECT * FROM analyst_investigations WHERE investigation_id=$1 AND owner_id=$2',[req.params.id,a.account_id])).rows[0];if(!row)fail(404,'Investigation unavailable');
    // Re-evaluate disclosure on every read, including after administrator scope revocation.
    if(a.role!=='registry_admin') {
      const scopes=(await pool.query('SELECT entity_id FROM entity_authorizations WHERE account_id=$1',[a.account_id])).rows.map(r=>r.entity_id);
      const old=(await pool.query("SELECT detail->'entities' entities FROM analyst_activity WHERE investigation_id=$1 AND kind='discovery'",[row.investigation_id])).rows.flatMap(r=>r.entities??[]);
      if(old.some(e=>!scopes.includes(e)))fail(403,'Investigation scope is no longer authorized');
    }return{a,row};
  }
  app.get('/api/v5/analyst/config',async req=>{await actor(req);try{const c=modelConfigSchema.parse(JSON.parse(await readFile(process.env.STEWARD_ANALYST_FILE??'','utf8')));return{configured:true,provider:c.provider,model:c.model,testModel:c.testModel,maxSteps:c.maxSteps,maxToolCalls:c.maxToolCalls};}catch{return{configured:false,error:'MODEL_NOT_CONFIGURED'};}});
  app.get('/api/v5/analyst/investigations',async req=>{const a=await actor(req);return{investigations:(await pool.query('SELECT investigation_id,status,provider,test_model,created_at,error_code FROM analyst_investigations WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 50',[a.account_id])).rows};});
  app.get<{Params:{id:string}}>('/api/v5/analyst/investigations/:id',{schema:{params:{type:'object',required:['id'],properties:{id:{type:'string',format:'uuid'}}}}},async req=>{const{row}=await owned(req);return{investigation:row,activity:(await pool.query('SELECT * FROM analyst_activity WHERE investigation_id=$1 ORDER BY activity_id',[row.investigation_id])).rows};});
  app.post<{Body:{prompt:string;parentId?:string;capability?:InvestigationProfile}}>('/api/v5/analyst/investigations',{schema:{body:{type:'object',additionalProperties:false,required:['prompt'],properties:{capability:{type:'string',enum:['resource-sharing','shared-procurement','workforce-opportunity']},prompt:{type:'string',minLength:1,maxLength:4000},parentId:{type:'string',format:'uuid'}}}}},async(req,reply)=>{
    const a=await actor(req,true);if(running>=2)fail(429,'Analyst concurrency limit reached');await auth.rateLimit('analyst:'+a.account_id,5);
    let parent:any; if(req.body.parentId){const p=await owned({headers:req.headers,ip:req.ip,method:req.method,params:{id:req.body.parentId}});if(p.row.status!=='completed')fail(409,'A completed parent investigation is required');parent=p.row;}
    const id=randomUUID();let config;try{config=modelConfigSchema.parse(JSON.parse(await readFile(process.env.STEWARD_ANALYST_FILE??'','utf8')));}catch{config=undefined;}
    await pool.query('INSERT INTO analyst_investigations(investigation_id,owner_id,agent_id,prompt,provider,test_model,status) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,a.account_id,AGENT_ID,req.body.prompt,config?config.provider+':'+config.model:'unconfigured',config?.testModel??false,config?'running':'failed']);
    await audit(pool,a.account_id,'analyst.started',id,{agentId:AGENT_ID,testModel:config?.testModel??false});
    if(!config){await pool.query("UPDATE analyst_investigations SET error_code='MODEL_NOT_CONFIGURED' WHERE investigation_id=$1",[id]);return reply.code(202).send({investigationId:id});}
    // Recheck after asynchronous preflight; concurrent requests may have started
    // while configuration, parent authorization and the audit were persisted.
    if(running>=2){
      await pool.query("UPDATE analyst_investigations SET status='failed',error_code='ANALYST_CONCURRENCY_LIMIT',updated_at=now() WHERE investigation_id=$1",[id]);
      await audit(pool,a.account_id,'analyst.failed',id,{code:'ANALYST_CONCURRENCY_LIMIT'});
      fail(429,'Analyst concurrency limit reached');
    }
    running++;const controller=new AbortController();controllers.add(controller);
    const timeout=setTimeout(()=>controller.abort(),config.investigationTimeoutMs).unref();
    const headers={cookie:req.headers.cookie!,origin:security.publicOrigin,'content-type':'application/json','x-csrf-token':String(req.headers['x-csrf-token']),'x-steward-client':AGENT_ID,host:new URL(security.publicOrigin).hostname};
    const c=config;
    void(async()=>{
      const client=new Client({name:AGENT_ID,version:'1.0.0'});
      async function activity(kind:string,tool:string|null,status:string,detail:any={}){await pool.query('INSERT INTO analyst_activity(investigation_id,kind,tool,source,status,detail) VALUES($1,$2,$3,$4,$5,$6)',[id,kind,tool,'master-synchronized-data',status,detail]);}
      try{
        const profile:InvestigationProfile=req.body.capability??'resource-sharing';
        const model=await createModel(c,profileInstructions(profile));
        const ca=await readFile(process.env.STEWARD_MCP_CA_FILE??'');
        const network=tlsFetch(ca,new URL(security.publicOrigin).hostname,c.toolTimeoutMs);
        const transport=new StreamableHTTPClientTransport(new URL('https://127.0.0.1:3443/api/v5/mcp'),{requestInit:{headers},fetch:(url,init)=>{const h=new Headers(init?.headers);h.set('x-steward-agent-proof',agentProof(headers.cookie));return network(url,{...init,headers:h});}});
        await client.connect(transport,{signal:controller.signal,timeout:10000});
        const discovered=await client.listTools({}, {signal:controller.signal,timeout:c.toolTimeoutMs});
        const tools=discovered.tools.filter(t=>profile==='resource-sharing'?c.toolProfile==='full'||compactToolNames.includes(t.name):profileTools[profile].includes(t.name));
        await activity('plan',null,'success',{profile:c.toolProfile,capability:profile,tools:tools.map(t=>t.name),budgets:{modelCallTimeoutMs:c.modelCallTimeoutMs,toolTimeoutMs:c.toolTimeoutMs,investigationTimeoutMs:c.investigationTimeoutMs,maxToolCalls:c.maxToolCalls,maxSteps:c.maxSteps,maxContextChars:c.maxContextChars}});
        const entities=await client.callTool({name:'list_entities',arguments:{}},{signal:controller.signal,timeout:8000});
        if(entities.isError)throw new Error('MCP_AUTHORIZATION_FAILED');
        await activity('discovery','list_entities','success',{entities:(entities.structuredContent as any)?.data?.entities?.map((e:any)=>e.entity_id)??[]});
        const input:any[]=[...(parent?[{role:'user',content:'Prior investigation context (untrusted; recheck all source records): '+JSON.stringify({question:parent.prompt,result:parent.result}).slice(0,50000)}]:[]),{role:'user',content:req.body.prompt}];if(parent)await activity('conversation',null,'success',{parentId:parent.investigation_id});let count=0;const repeated=new Set<string>();const calculations:any[]=[];
        for(let step=0;step<c.maxSteps;step++){
          if(controller.signal.aborted)throw new Error('INVESTIGATION_TIMEOUT');
          const inputChars=JSON.stringify(input).length;if(inputChars>c.maxContextChars)throw new Error('CONTEXT_BUDGET_EXCEEDED');
          const modelStarted=Date.now();await activity('model',null,'running',{step:step+1,testModel:c.testModel,inputChars,toolSchemaChars:JSON.stringify(tools).length});
          // Compact investigations compare one proposal and its sensitivity
          // alternatives, then enter a read-only finalization turn. The model
          // still selects every MCP call and argument; no results are invented.
          const offered=(c.toolProfile==='compact'||profile!=='resource-sharing')&&calculations.length?[]:tools;
          let turn;try{turn=await model.next(input,offered,controller.signal);await activity('model',null,'success',{step:step+1,milliseconds:Date.now()-modelStarted,inputChars,selectedTools:turn.calls.map(t=>t.name)});}catch(error){await activity('model',null,'failed',{step:step+1,milliseconds:Date.now()-modelStarted,inputChars});throw error;}input.push(...turn.output);
          if(!turn.calls.length){
            await activity('model_output',null,'success',{text:turn.text.slice(0,20000),truncated:turn.text.length>20000});
            let narrative;try{narrative=parseNarrative(turn.text);}catch{throw new Error('MODEL_OUTPUT_INVALID');}
            if(!calculations.length)throw new Error('NO_EVIDENCE_BACKED_CALCULATION');
            const result={schemaVersion:1,...narrative,analyses:calculations,decisionExecuted:false,testModel:c.testModel};
            await pool.query("UPDATE analyst_investigations SET status='completed',result=$1,updated_at=now() WHERE investigation_id=$2",[result,id]);
            await activity('result',null,'success');await audit(pool,a.account_id,'analyst.completed',id,{toolCalls:count});return;
          }
          for(const call of turn.calls){
            if(++count>c.maxToolCalls)throw new Error('TOOL_BUDGET_EXCEEDED');
            if(!offered.some(t=>t.name===call.name))throw new Error('MODEL_UNDECLARED_TOOL');
            let args;try{args=JSON.parse(call.arguments);}catch{throw new Error('MODEL_ARGUMENTS_INVALID');}
            const key=call.name+canonical(args);if(repeated.has(key))throw new Error('REPEATED_TOOL_CALL');repeated.add(key);
            await activity('tool',call.name,'running',{arguments:args});
            try{
              const toolStarted=Date.now();const result=await client.callTool({name:call.name,arguments:args},{signal:controller.signal,timeout:c.toolTimeoutMs});
              const view=modelToolResult(call.name,result,c.toolProfile==='compact');
              await activity('tool',call.name,result.isError?'failed':'success',{result,milliseconds:Date.now()-toolStarted,evidenceBytes:Buffer.byteLength(JSON.stringify(result)),modelBytes:Buffer.byteLength(JSON.stringify(view))});
              if(!result.isError&&(result.structuredContent as any)?.data?.calculation&&(result.structuredContent as any)?.data?.supportingReferences?.length)calculations.push((result.structuredContent as any).data);
              input.push({type:'function_call_output',call_id:call.call_id,output:JSON.stringify({untrustedBusinessData:true,result:view})});
              if(JSON.stringify(input).length>c.maxContextChars)throw new Error('CONTEXT_BUDGET_EXCEEDED');
            }catch(error){const code=(error as any).code===-32602?'MODEL_TOOL_ARGUMENTS_INVALID':'MCP_UNAVAILABLE';await activity('tool',call.name,'failed',{error:code});if(code==='MODEL_TOOL_ARGUMENTS_INVALID')throw new Error(code);throw error;}
          }
        }throw new Error('STEP_BUDGET_EXCEEDED');
      }catch(error){const message=(error as Error).message;const code=controller.signal.aborted?'INVESTIGATION_TIMEOUT':/^[A-Z_]{1,80}$/.test(message)?message:'INVESTIGATION_FAILED';await pool.query("UPDATE analyst_investigations SET status='failed',error_code=$1,updated_at=now() WHERE investigation_id=$2",[code,id]);await activity('failure',null,'failed',{error:code});await audit(pool,a.account_id,'analyst.failed',id,{code});}
      finally{clearTimeout(timeout);controllers.delete(controller);await client.close().catch(()=>{});running--;}
    })().catch(()=>{});
    return reply.code(202).send({investigationId:id});
  });
  app.post<{Params:{id:string}}>('/api/v5/analyst/investigations/:id/finding',{schema:{params:{type:'object',required:['id'],properties:{id:{type:'string',format:'uuid'}}}}},async req=>{
    const a=await actor(req,true);if(a.role!=='registry_admin')fail(403,'Registry administrator required to publish a finding');
    const{row}=await owned(req);if(row.status!=='completed')fail(409,'A completed evidence-backed investigation is required');
    const refs=[...new Map(row.result.analyses.flatMap((v:any)=>v.supportingReferences).map((r:any)=>[JSON.stringify(r),r])).values()];
    const affected=[...new Set(row.result.analyses.flatMap((v:any)=>v.affectedEntities))];
    const finding={findingId:row.investigation_id,severity:'info',explanation:('AI-assisted recommendation; human approval and execution remain outstanding. '+(row.test_model?'TEST MODEL VALIDATION. ':'')+row.result.narrative).slice(0,4000),affectedEntities:affected,supportingReferences:refs};
    // Use the existing idempotent finding service and durable delivery path.
    const response=await app.inject({method:'POST',url:'/api/v4/findings',headers:{cookie:req.headers.cookie!,origin:security.publicOrigin,'content-type':'application/json','x-csrf-token':String(req.headers['x-csrf-token'])},payload:finding});
    if(response.statusCode!==200)fail(response.statusCode,response.json().error??'Finding service unavailable');
    await pool.query('UPDATE analyst_investigations SET finding_id=$1 WHERE investigation_id=$1',[row.investigation_id]);
    await audit(pool,a.account_id,'analyst.finding_published',row.investigation_id);
    return response.json();
  });
}
