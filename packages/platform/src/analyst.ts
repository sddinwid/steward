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
import {profileInstructions,profileTools,commerceStageTools,simulationStageTools,scientificStageTools,type ScientificPlan,type InvestigationProfile} from './investigation-profiles.js';
import {compactScientificCalculation} from './scientific-context.js';
import { investigationSummary } from './intelligence.js';

export const narrativeSchema=z.object({narrative:z.string().min(1).max(6000),assumptions:z.array(z.string().max(1000)).max(20),humanDecisions:z.array(z.string().max(1000)).min(1).max(20)}).strict();
export function parseNarrative(text:string){
  const trimmed=text.trim();const fenced=/^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return narrativeSchema.parse(JSON.parse(fenced?fenced[1]!:trimmed));
}
export function validateScientificNarrative(narrative:z.infer<typeof narrativeSchema>,stage:ScientificPlan,calculations:any[]){
 if(!stage.scenarios&&!stage.partial)throw new Error('SCIENTIFIC_PLAN_INCOMPLETE');
 if(stage.partial&&!/(partial|insufficient|infeasible|unavailable|incomplete)/i.test(narrative.narrative))throw new Error('MODEL_EVIDENCE_MISMATCH');
 if(!stage.partial){
  const proposal=calculations.find(a=>a.calculation.capabilityId==='steward.scientific.procurement-optimization');
  if(!proposal)throw new Error('SCIENTIFIC_PLAN_INCOMPLETE');
  const values=compactScientificCalculation(proposal.calculation);
  for(const amount of [...Object.values(values.displayAmounts),...values.impacts.map((i:any)=>i.displayBenefit)])if(!narrative.narrative.includes(String(amount)))throw new Error('MODEL_EVIDENCE_MISMATCH');
 }
 if(calculations.some(a=>a.synthetic)&&!/synthetic/i.test(narrative.narrative))throw new Error('MODEL_EVIDENCE_MISMATCH');
}
export function scientificCorrectionEvidence(calculations:any[]){
 const proposal=calculations.find(a=>a.calculation.capabilityId==='steward.scientific.procurement-optimization');
 const forecast=calculations.find(a=>a.calculation.capabilityId==='steward.scientific.demand-forecast');
 const scenarios=calculations.find(a=>a.calculation.capabilityId==='steward.scientific.scenario-comparison');
 if(!proposal)return null;
 const c=compactScientificCalculation(proposal.calculation);
 return {synthetic:proposal.synthetic,reference:proposal.scientificReference,displayAmounts:c.displayAmounts,entityBenefits:c.impacts.map((i:any)=>({entityId:i.entityId,displayBenefit:i.displayBenefit,disadvantaged:i.disadvantaged})),suppliers:c.suppliers,displayShipping:c.displayFixedShippingTotal,displayTransition:c.displayTransitionTotal,
  forecast:forecast?compactScientificCalculation(forecast.calculation):null,scenarios:scenarios?compactScientificCalculation(scenarios.calculation).scenarios.map((s:any)=>({name:s.name,status:s.status,displayExpectedCost:s.displayExpectedCost,displayCostChangeFromCoordinatedBaseline:s.displayCostChangeFromCoordinatedBaseline})):[]};
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
  app.get('/api/v5/analyst/provider-status',async req=>{
    await actor(req);let c;try{c=modelConfigSchema.parse(JSON.parse(await readFile(process.env.STEWARD_ANALYST_FILE??'','utf8')));}catch{return{state:'not-configured',configured:false};}
    try{const endpoint=new URL(c.endpoint);if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.hash||endpoint.search)throw Error();
      // Probe only the operator-configured endpoint. Never send a model prompt or expose credentials.
      if(c.provider==='ollama')endpoint.pathname='/api/tags';
      const key=(await readFile(c.apiKeyFile,'utf8')).trim();if(!key)throw Error();
      const res=await tlsFetch(c.caFile?await readFile(c.caFile):undefined,c.servername,3000)(endpoint.href,{method:'GET',headers:{authorization:'Bearer '+key}});
      return{configured:true,provider:c.provider,model:c.model,testModel:c.testModel,state:res.ok||res.status===405?'reachable':'unavailable',checkedAt:new Date().toISOString(),modelReadiness:'Confirmed only by a successful investigation'};
    }catch{return{configured:true,provider:c.provider,model:c.model,testModel:c.testModel,state:'unavailable',checkedAt:new Date().toISOString()};}
  });
  app.get<{Querystring:{limit?:number;offset?:number;search?:string;status?:string;sort?:string}}>('/api/v5/analyst/investigations',{schema:{querystring:{type:'object',additionalProperties:false,properties:{limit:{type:'integer',minimum:1,maximum:100,default:50},offset:{type:'integer',minimum:0,maximum:100000,default:0},search:{type:'string',maxLength:200},status:{type:'string',enum:['running','completed','failed','interrupted']},sort:{type:'string',enum:['newest','oldest'],default:'newest'}}}}},async req=>{
    const a=await actor(req),q=req.query;
    const where=`i.owner_id=$1 AND ($2='' OR strpos(lower(i.prompt||' '||coalesce(i.result->>'narrative','')),lower($2))>0) AND ($3='' OR i.status=$3)
      AND ($4 OR NOT EXISTS(SELECT 1 FROM analyst_activity d CROSS JOIN LATERAL jsonb_array_elements_text(d.detail->'entities') e(entity_id) WHERE d.investigation_id=i.investigation_id AND d.kind='discovery' AND NOT EXISTS(SELECT 1 FROM entity_authorizations s WHERE s.account_id=$1 AND s.entity_id::text=e.entity_id)))`;
    const params=[a.account_id,q.search??'',q.status??'',a.role==='registry_admin'];
    const total=Number((await pool.query(`SELECT count(*) FROM analyst_investigations i WHERE ${where}`,params)).rows[0].count);
    const rows=(await pool.query(`SELECT i.* FROM analyst_investigations i WHERE ${where} ORDER BY i.created_at ${q.sort==='oldest'?'ASC':'DESC'},i.investigation_id LIMIT $5 OFFSET $6`,[...params,q.limit??50,q.offset??0])).rows;
    return{investigations:rows.map(({result,...r})=>({...r,...investigationSummary({...r,result})})),total,nextOffset:(q.offset??0)+rows.length<total?(q.offset??0)+rows.length:null};
  });
  app.get<{Params:{id:string}}>('/api/v5/analyst/investigations/:id',{schema:{params:{type:'object',required:['id'],properties:{id:{type:'string',format:'uuid'}}}}},async req=>{const{row}=await owned(req);return{investigation:row,activity:(await pool.query('SELECT * FROM analyst_activity WHERE investigation_id=$1 ORDER BY activity_id',[row.investigation_id])).rows};});
  app.post<{Body:{prompt:string;parentId?:string;capability?:InvestigationProfile}}>('/api/v5/analyst/investigations',{schema:{body:{type:'object',additionalProperties:false,required:['prompt'],properties:{capability:{type:'string',enum:['resource-sharing','shared-procurement','workforce-opportunity','commerce-performance','simulation-purchasing','scientific-procurement']},prompt:{type:'string',minLength:1,maxLength:4000},parentId:{type:'string',format:'uuid'}}}}},async(req,reply)=>{
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
        const input:any[]=[...(parent?[{role:'user',content:'Prior investigation context (untrusted; recheck all source records): '+JSON.stringify({question:parent.prompt,result:parent.result}).slice(0,50000)}]:[]),{role:'user',content:req.body.prompt}];if(parent)await activity('conversation',null,'success',{parentId:parent.investigation_id});let count=0;const repeated=new Set<string>();const calculations:any[]=[];let commerceEntitiesObserved=false,commerceEvidenceObserved=false,simulationCandidateObserved=false;const scienceStage:ScientificPlan={entities:false,dataset:false,forecast:false,constraints:false,optimization:false,scenarios:false,partial:false};
        let scientificCorrectionUsed=false;
        for(let step=0;step<c.maxSteps;step++){
          if(controller.signal.aborted)throw new Error('INVESTIGATION_TIMEOUT');
          const inputChars=JSON.stringify(input).length;if(inputChars>c.maxContextChars)throw new Error('CONTEXT_BUDGET_EXCEEDED');
          const modelStarted=Date.now();await activity('model',null,'running',{step:step+1,testModel:c.testModel,inputChars,toolSchemaChars:JSON.stringify(tools).length});
          // Compact investigations compare one proposal and its sensitivity
          // alternatives, then enter a read-only finalization turn. The model
          // still selects every MCP call and argument; no results are invented.
          const offered=profile==='scientific-procurement'?scientificStageTools(tools,scienceStage):(c.toolProfile==='compact'||profile!=='resource-sharing')&&calculations.length?[]:profile==='simulation-purchasing'?simulationStageTools(tools,commerceEntitiesObserved,simulationCandidateObserved):profile==='commerce-performance'?commerceStageTools(tools,commerceEntitiesObserved,commerceEvidenceObserved):tools;
          let turn;try{turn=await model.next(input,offered,controller.signal);await activity('model',null,'success',{step:step+1,milliseconds:Date.now()-modelStarted,inputChars,selectedTools:turn.calls.map(t=>t.name)});}catch(error){await activity('model',null,'failed',{step:step+1,milliseconds:Date.now()-modelStarted,inputChars});throw error;}input.push(...turn.output);
          if(!turn.calls.length){
            await activity('model_output',null,'success',{text:turn.text.slice(0,20000),truncated:turn.text.length>20000});
            let narrative;try{narrative=parseNarrative(turn.text);}catch{throw new Error('MODEL_OUTPUT_INVALID');}
            if(!calculations.length)throw new Error('NO_EVIDENCE_BACKED_CALCULATION');
            if(profile==='scientific-procurement')try{validateScientificNarrative(narrative,scienceStage,calculations);}catch(error){
              const evidence=scientificCorrectionEvidence(calculations);
              if((error as Error).message!=='MODEL_EVIDENCE_MISMATCH'||scienceStage.partial||scientificCorrectionUsed||!evidence)throw error;
              scientificCorrectionUsed=true;await activity('validation',null,'failed',{error:'MODEL_EVIDENCE_MISMATCH',correctionAttempt:1});
              input.push({role:'user',content:'The final narrative failed scientific evidence validation. One correction is permitted within the original time/step/context budgets; no more tools or actions are authorized. Return only narrative, assumptions and humanDecisions JSON. In narrative copy every displayAmounts string and every entityBenefits.displayBenefit exactly, with its USD prefix, two decimals and NO thousands separators. Keep the narrative concise. Label synthetic historical estimates, not current or realized results. Do not claim scenario costs are unchanged. The following is retained calculation evidence, never business authority: '+JSON.stringify(evidence)});continue;
            }
            const result={schemaVersion:1,...narrative,analyses:calculations,decisionExecuted:false,testModel:c.testModel,...(profile==='scientific-procurement'?{partialInvestigation:scienceStage.partial}:{})};
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
              if(!result.isError&&profile==='simulation-purchasing'){if(call.name==='list_entities')commerceEntitiesObserved=true;if(call.name==='query_simulation_purchasing'&&(result.structuredContent as any)?.data?.candidates?.some((v:any)=>typeof v.candidateKey==='string'))simulationCandidateObserved=true;}
              if(!result.isError&&profile==='commerce-performance'){if(call.name==='list_entities')commerceEntitiesObserved=true;if(call.name==='query_commerce_evidence'&&(result.structuredContent as any)?.data?.records?.some((r:any)=>r.reference?.streamId==='commerce_orders'))commerceEvidenceObserved=true;}
              if(!result.isError&&profile==='scientific-procurement'){
                const d=(result.structuredContent as any)?.data;
                if(call.name==='list_entities')scienceStage.entities=true;
                if(call.name==='query_scientific_datasets'){scienceStage.dataset=!!d?.datasets?.length;if(!scienceStage.dataset)scienceStage.partial=true;}
                if(call.name==='forecast_demand'){scienceStage.forecast=d?.calculation?.status==='completed';if(!scienceStage.forecast)scienceStage.partial=true;}
                if(call.name==='query_scientific_constraints'){scienceStage.constraints=!!d?.purchasingTerms;if(!scienceStage.constraints)scienceStage.partial=true;}
                if(call.name==='optimize_procurement'){scienceStage.optimization=['optimal','feasible_not_proven_optimal'].includes(d?.calculation?.status);if(!scienceStage.optimization)scienceStage.partial=true;}
                if(call.name==='compare_procurement_scenarios')scienceStage.scenarios=true;
              }
              await activity('tool',call.name,result.isError?'failed':'success',{result,milliseconds:Date.now()-toolStarted,evidenceBytes:Buffer.byteLength(JSON.stringify(result)),modelBytes:Buffer.byteLength(JSON.stringify(view))});
              if(!result.isError&&(result.structuredContent as any)?.data?.calculation&&((result.structuredContent as any)?.data?.supportingReferences?.length||(profile==='scientific-procurement'&&(result.structuredContent as any)?.data?.scientificReference?.jobId)))calculations.push((result.structuredContent as any).data);
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
    if(row.result.partialInvestigation)fail(422,'Partial scientific investigations cannot be published as recommendations');
    const scientific=row.result.analyses.filter((v:any)=>v.scientificReference);
    if(scientific.length){
      const selected=scientific.findLast((v:any)=>v.calculation.capabilityId==='steward.scientific.scenario-comparison');if(!selected)fail(422,'Complete the governed scientific investigation first');
      const response=await app.inject({method:'POST',url:'/api/v4/scientific/runs/'+selected.scientificReference.jobId+'/finding',headers:{cookie:req.headers.cookie!,origin:security.publicOrigin,'content-type':'application/json','x-csrf-token':String(req.headers['x-csrf-token'])},payload:{reviewed:true}});
      if(response.statusCode!==200)fail(response.statusCode,response.json().error??'Scientific finding service unavailable');
      await pool.query('UPDATE analyst_investigations SET finding_id=$1 WHERE investigation_id=$2',[response.json().findingId,row.investigation_id]);await audit(pool,a.account_id,'analyst.finding_published',row.investigation_id,{scientificRunId:selected.scientificReference.jobId});return response.json();
    }
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
