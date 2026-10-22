import assert from 'node:assert/strict';
import { logins,api } from './phase4-client.mjs';
import { mcp } from './mcp-client.mjs';
import { sql } from './lib.mjs';
await logins();
for(const key of ['master','worker-1','worker-2','worker-3']){
 await api(key,'/api/v5/mcp','GET',undefined,405);
 const client=await mcp(key);
 try{const{tools}=await client.listTools();assert.ok(tools.length>=4);const tool=key==='master'?'list_entities':'get_company_profile';const r=await client.callTool({name:tool,arguments:{}});assert.ok(!r.isError);assert.equal(r.structuredContent.schemaVersion,1);
 if(key==='master'){
  const records=[];for(const e of r.structuredContent.data.entities){const s=await client.callTool({name:'get_entity_summary',arguments:{entityId:e.entity_id}});records.push(...s.structuredContent.data.records);}
  const pairs=records.filter(s=>s.stream_id==='warehouse_assets'&&Number(s.payload.available_m3)>0).flatMap(s=>records.filter(d=>d.stream_id==='storage_requirements'&&d.entity_id!==s.entity_id&&d.payload.site===s.payload.site&&Number(s.payload.available_m3)>=Number(d.payload.required_m3)).map(d=>({s,d}))).sort((a,b)=>Number(b.d.payload.monthly_external_cost)-Number(a.d.payload.monthly_external_cost));
  if(pairs.length){const{s,d}=pairs[0],ref=r=>({entityId:r.entity_id,moduleId:r.module_id,streamId:r.stream_id,recordId:r.record_id,revision:Number(r.revision)});const calculation=await client.callTool({name:'analyze_resource_sharing',arguments:{supply:ref(s),demand:ref(d),assumptions:{internalMonthlyPayment:3000,incrementalMonthlyCost:1000,transitionExpense:6000,horizonMonths:12,avoidableExternalFraction:1,locationCompatible:true,sensitivity:[]}}});assert.ok(!calculation.isError);assert.equal(calculation.structuredContent.data.calculation.proposal.ecosystemMonthlyBenefit,Number(d.payload.monthly_external_cost)-1000);assert.equal(sql('master',"SELECT jsonb_array_length(detail->'targetEntities') FROM security_audit WHERE action='mcp.allowed' AND target_id='analyze_resource_sharing' ORDER BY occurred_at DESC LIMIT 1"),'2');console.log('PASS current Master analytical tool and audit record identify both target entities');}
 }
 console.log('PASS '+key+': official MCP v2 Streamable HTTP discovery and '+tool+' on real data ('+tools.length+' tools)');}finally{await client.close();}
}
