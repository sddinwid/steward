// Focused real-model diagnostic using already retrieved synthetic evidence.
// This is NOT an end-to-end MCP investigation or permission to publish a finding.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {economicStageInstruction,validateEconomicNarrative} from '../packages/platform/dist/economic-investigation.js';
import {narrativeOutputSchema} from '../packages/platform/dist/ollama-model.js';
const retained=JSON.parse(await readFile('artifacts/phase14-economic-ollama.json','utf8'));
const analysis=retained.activity.find(a=>a.tool==='analyze_economic_sustainability'&&a.status==='success')?.detail.result.structuredContent.data;
assert(analysis?.economicCalculationId,'An actual previous MCP economic calculation is required');
const started=Date.now(),report={standaloneFinalReplay:true,liveMcpEndToEnd:false,status:'in-progress'};
try{
 const messages=[{role:'system',content:economicStageInstruction(true,true,[analysis])},{role:'user',content:'Explain the reviewed synthetic economic comparison. Start narrative with the synthetic/approval qualification, then include every scenario total and baseline programme unit/cost fact in narrative. Keep assumptions qualitative and humanDecisions as future review actions.'}];
 const response=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'steward-analyst-qwen2.5-ctx16384:7b',messages,stream:false,format:narrativeOutputSchema,options:{num_ctx:16384,num_predict:1600,temperature:0},keep_alive:0}),signal:AbortSignal.timeout(120000)});
 assert.equal(response.status,200);report.response=await response.json();validateEconomicNarrative(JSON.parse(report.response.message.content),[analysis]);report.status='passed';
}catch(error){report.status='failed';report.error=error.message;process.exitCode=1;}finally{report.elapsedMs=Date.now()-started;await writeFile('artifacts/phase14-economic-final-view-replay.json',JSON.stringify(report,null,2)+'\n');console.log(report.status+' '+report.elapsedMs+'ms');}
