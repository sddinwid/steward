// Focused finalization diagnostic from retained real MCP results. No new MCP calls,
// findings or execution; this cannot substitute for a complete deployed investigation.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {modelToolResult} from '../packages/platform/dist/analyst-context.js';
import {economicModelInput,economicReferenceKey,economicStageInstruction,validateEconomicNarrative} from '../packages/platform/dist/economic-investigation.js';
import {ollamaMessages,narrativeOutputSchema} from '../packages/platform/dist/ollama-model.js';
import {profileInstructions} from '../packages/platform/dist/investigation-profiles.js';
const prior=JSON.parse(await readFile('artifacts/phase14-economic-cost-ollama.json','utf8'));
const report={startedAt:new Date().toISOString(),status:'in-progress',standaloneDiagnostic:true,liveMcpEndToEnd:false,model:prior.model,sourceInvestigationId:prior.investigationId};
try{
 const actions=prior.activity.filter(a=>a.kind==='tool'&&a.status==='success'&&['analyze_economic_sustainability','query_economic_outcomes'].includes(a.tool));
 const calculation=actions.find(a=>a.tool==='analyze_economic_sustainability').detail.result.structuredContent.data;
 const results=actions.filter(a=>a.tool==='query_economic_outcomes').map(a=>a.detail.result.structuredContent.data);
 assert.equal(results.length,3);
 const state={requested:true,completed:results.flatMap(d=>d.records.map(r=>economicReferenceKey(r.financialReference))),results};
 const input=[{role:'user',content:'Investigate the reviewed synthetic economic alternatives and recorded service costs. Recommend review of one alternative without authorizing or executing a decision.'},...actions.flatMap((a,i)=>[{type:'function_call',call_id:'retained-'+i,name:a.tool,arguments:'{}'},{type:'function_call_output',call_id:'retained-'+i,output:JSON.stringify({untrustedBusinessData:true,result:modelToolResult(a.tool,a.detail.result,true)})}])];
 const messages=ollamaMessages(economicModelInput(input,[calculation],state),profileInstructions('economic-sustainability')+' FINALIZATION: The calculation succeeded. No tools remain; produce the final evidence-supported JSON now.'+economicStageInstruction(true,true,[calculation],false,state));report.inputChars=JSON.stringify(messages).length;
 const start=Date.now();const response=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:prior.model,messages,stream:false,keep_alive:0,options:{num_predict:2200},format:narrativeOutputSchema}),signal:AbortSignal.timeout(120000)});assert.equal(response.status,200);report.response=await response.json();report.elapsedMs=Date.now()-start;report.narrative=JSON.parse(report.response.message.content);validateEconomicNarrative(report.narrative,[calculation],state);report.status='passed';
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;}finally{
 await fetch('http://127.0.0.1:11434/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:prior.model,keep_alive:0}),signal:AbortSignal.timeout(10000)}).catch(()=>{});
 report.finishedAt=new Date().toISOString();await writeFile('artifacts/phase14-economic-final-model-diagnostic.json',JSON.stringify(report,null,2)+'\n');console.log('Retained-evidence final-model diagnostic: '+report.status);
}
