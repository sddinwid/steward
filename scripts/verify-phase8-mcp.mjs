import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {directory} from './lib.mjs';
import {canonicalBusinessPayload} from '../packages/platform/dist/business-analysis.js';
import {calculateCommerce} from '../packages/platform/dist/commerce-analysis.js';
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');
const {api,logins,login,sessions,credentials}=await import('./phase4-client.mjs'),{mcp}=await import('./mcp-client.mjs');
await logins();const clients=[],client=async()=>{const c=await mcp('master');clients.push(c);return c;},call=(c,name,args={})=>c.callTool({name,arguments:args},{timeout:15000});
const report={verifiedAt:new Date().toISOString(),simulation:true,checks:[]};
try{
 const c=await client(),tools=(await c.listTools()).tools.map(t=>t.name);for(const name of ['query_commerce_evidence','query_commerce_anomalies','analyze_commerce_by_id'])assert(tools.includes(name));
 const p=await call(c,'query_commerce_evidence',{limit:20});assert(!p.isError);const records=p.structuredContent.data.records;assert(records.length>=2);
 const refs=records.map(r=>({recordId:r.reference.recordId,revision:r.reference.revision}));const result=await call(c,'analyze_commerce_by_id',{sources:refs});assert(!result.isError,JSON.stringify(result));const data=result.structuredContent.data,calculation=data.calculation;
 assert.equal(calculation.recognizedRevenueCents,records.length*5000);assert.equal(calculation.costBasis,'estimated');assert.equal(calculation.grossMarginCents,records.filter(r=>r.productionCostCents===1600).length*3000+records.filter(r=>r.productionCostCents===3200).length*1400);
 const actual=(await api('master','/api/v4/analytics')).value.records.filter(r=>records.some(p=>p.reference.recordId===r.record_id)&&r.stream_id==='commerce_orders');assert.deepEqual(calculation,calculateCommerce(refs.map(ref=>canonicalBusinessPayload(actual.find(r=>r.record_id===ref.recordId&&Number(r.revision)===ref.revision)))));
 assert.equal((await call(c,'analyze_commerce_by_id',{sources:[refs[0],refs[0]]})).isError,true);assert.equal((await call(c,'analyze_commerce_by_id',{sources:[{...refs[0],revision:refs[0].revision+1000}]})).isError,true);
 report.evidence=p.structuredContent;report.analysis=data;report.checks.push('live MCP discovery, deterministic exact-cent recomputation, exact stream identity and stale/duplicate-source rejection');
 const anomalies=await call(c,'query_commerce_anomalies',{limit:20});assert(!anomalies.isError);assert(anomalies.structuredContent.data.matches.some(r=>r.issues.includes('high_estimated_cost')));report.anomalies=anomalies.structuredContent.data;
 const registry=sessions.master;await login('master',credentials.accounts.enroller);const scoped=await client(),visible=await call(scoped,'query_commerce_evidence',{limit:20});assert(!visible.isError);assert(visible.structuredContent.data.records.every(r=>r.entityId===credentials.entityA));const foreign=records.find(r=>r.entityId!==credentials.entityA);assert(foreign);assert.equal((await call(scoped,'analyze_commerce_by_id',{sources:[{recordId:foreign.reference.recordId,revision:foreign.reference.revision}]})).isError,true);sessions.master=registry;report.checks.push('entity-scoped MCP evidence/calculation authorization and attributed high-cost anomaly');
 report.status='passed';console.log('PASS governed commerce MCP, exact cents, source revisions, anomaly evidence and entity isolation: '+JSON.stringify(calculation.displayAmounts));
}catch(e){report.status='failed';report.error=e.message;throw e;}finally{for(const c of clients)await c.close();await writeFile('artifacts/phase8-commerce-mcp.json',JSON.stringify(report,null,2)+'\n');}
