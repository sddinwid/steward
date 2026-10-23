import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {api,login,credentials,sessions} from './phase4-client.mjs';
import {mcp} from './mcp-client.mjs';
const report={verifiedAt:new Date().toISOString(),checks:[]};
await login('master',credentials.accounts.registry);const registry=sessions.master;
const clients=[];const connect=async()=>{const c=await mcp('master');clients.push(c);return c;};
const call=(c,name,args={})=>c.callTool({name,arguments:args},{timeout:10000});
try{
 const c=await connect(),matches=(await call(c,'query_resource_matches',{limit:1})).structuredContent.data;
 assert.ok(matches.matches.length===1);const {supply,demand}=matches.matches[0];assert.notEqual(supply.entityId,demand.entityId);
 const page=(await call(c,'query_entity_resources',{entityId:supply.entityId,category:'supply',fields:['availableCapacity'],limit:1})).structuredContent.data;
 assert.ok(page.resources[0].sourceWorker);assert.equal(page.resources[0].name,undefined);assert.ok(page.resources[0].recordId);
 if(page.total>1){const next=(await call(c,'query_entity_resources',{entityId:supply.entityId,category:'supply',limit:1,offset:1})).structuredContent.data;assert.notEqual(next.resources[0].recordId,page.resources[0].recordId);}
 const full=(await call(c,'get_entity_summary',{entityId:supply.entityId})).structuredContent.data;
 assert.ok(full.records.some(r=>r.record_id===supply.recordId&&Number(r.revision)===supply.revision));
 assert.ok((await call(c,'query_entity_resources',{entityId:'ffffffff-ffff-4fff-8fff-ffffffffffff'})).isError);
 let invalidRejected=false;try{invalidRejected=Boolean((await call(c,'query_entity_resources',{fields:['*']})).isError);}catch{invalidRejected=true;}assert.ok(invalidRejected);
 const args={supplyRecordId:supply.recordId,demandRecordId:demand.recordId,supplyRevision:supply.revision,demandRevision:demand.revision,internalMonthlyPayment:3000,incrementalMonthlyCost:1000,transitionExpense:6000,horizonMonths:12,avoidableExternalFraction:1,locationCompatible:true,sensitivity:[]};
 assert.ok(!(await call(c,'analyze_resource_sharing_by_id',args)).isError);
 assert.ok((await call(c,'analyze_resource_sharing_by_id',{...args,supplyRevision:supply.revision+1000000})).isError);
 report.checks.push('actual source references, field selection, pagination, legacy full evidence, unknown entity, invalid fields and stale-revision rejection');
 await login('master',credentials.accounts.enroller);const scoped=await connect();
 const allowed=(await call(scoped,'list_entities')).structuredContent.data.entities.map(e=>e.entity_id);
 const outsider=[supply.entityId,demand.entityId].find(id=>!allowed.includes(id));assert.ok(outsider);
 for(const tool of ['query_entity_resources','query_resource_matches','query_business_relationships'])assert.ok((await call(scoped,tool,{entityId:outsider})).isError);
 const resources=(await call(scoped,'query_entity_resources')).structuredContent.data.resources;assert.ok(resources.every(r=>allowed.includes(r.entityId)));
 const relationships=(await call(scoped,'query_business_relationships')).structuredContent.data.relationships;assert.ok(relationships.every(r=>allowed.includes(r.from_entity)&&allowed.includes(r.to_entity)));
 assert.ok((await call(scoped,'analyze_resource_sharing_by_id',args)).isError);
 await login('master',credentials.accounts.viewer);await assert.rejects(mcp('master'));
 report.checks.push('new queries and calculation enforce every entity scope, both relationship endpoints, source resolution and unauthorized-account rejection');
 await writeFile('artifacts/phase5b-compact-mcp.json',JSON.stringify(report,null,2)+'\n');
 console.log('PASS compact MCP pagination, selected fields, actual provenance, stale sources, scope isolation and unchanged legacy evidence');
}finally{sessions.master=registry;for(const c of clients)await c.close().catch(()=>{});}
