import { writeFile } from 'node:fs/promises';
import { api, login, credentials, waitFor } from './phase4-client.mjs';
await login('master',credentials.accounts.registry);
const config=(await api('master','/api/v5/analyst/config')).value;
if(!config.configured||config.testModel){
 const result={verifiedAt:new Date().toISOString(),status:'not_verified',reason:config.testModel?'Only a test-model provider is configured':'No live model-provider configuration or credentials supplied'};
 await writeFile('artifacts/phase5-live-provider.json',JSON.stringify(result,null,2)+'\n');
 console.log('NOT VERIFIED: '+result.reason);process.exitCode=2;
}else{
 const id=(await api('master','/api/v5/analyst/investigations','POST',{prompt:process.env.STEWARD_ANALYST_PROMPT??'Investigate storage resource sharing using authorized synchronized records and relationships. State cost and location assumptions explicitly, compare alternatives and calculate ecosystem benefits using the analytical tool. Do not publish a finding.'},202)).value.investigationId;
 const run=await waitFor(async()=>{const r=(await api('master','/api/v5/analyst/investigations/'+id)).value;return r.investigation.status!=='running'?r:false;},'live model-provider investigation',920000);
 const result={verifiedAt:new Date().toISOString(),provider:config.provider,model:config.model,status:run.investigation.status,error:run.investigation.error_code,investigationId:id,tools:run.activity.filter(a=>a.kind==='tool'&&a.status==='success').map(a=>a.tool),testModel:run.investigation.test_model};
 await writeFile('artifacts/phase5-live-provider.json',JSON.stringify(result,null,2)+'\n');
 if(result.status!=='completed'||!result.tools.some(name=>['analyze_resource_sharing','analyze_resource_sharing_by_id'].includes(name))){console.log('FAILED live model-provider verification: '+(result.error??'Evidence-backed investigation incomplete'));process.exitCode=1;}else console.log('PASS live model-provider investigation, real MCP tool calls and evidence-backed calculations. No finding published.');
}
