import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createBusinessServer,ensure} from '../dist/index.js';

function fixture({identity=true,approval=true}={}){
 const sql=[],audits=[],accesses=[],actor=randomUUID(),installationId=randomUUID(),entityId=randomUUID();
 const providerIdentity={workerInstallationId:installationId,entityId,moduleId:'test.pricing',moduleInstallationId:randomUUID(),packageDigest:'a'.repeat(64)};
 const runtime={installationId,entityId,configuration:{providerIdentity:{...providerIdentity,moduleInstallationId:randomUUID()}},...(identity?{providerIdentity}:{})};
 const manifest={moduleId:'test.pricing',api:[{method:'POST',path:'/preview',operationId:'preview',permission:'test.pricing.read'},{method:'GET',path:'/legacy',operationId:'legacy',permission:'test.pricing.read'}],ui:[],...(approval?{approvalServices:{contractVersion:1,reviewerPermission:'test.pricing.review'}}:{})};
 const pool={connect:async()=>({query:async statement=>{sql.push(statement);return{rows:[]};},release(){}})};
 const definition={manifest,resources:[],actions:[],authorize:async(c,access)=>{accesses.push(access);ensure(access.input?.deny!==true,'Denied',403);},auditAccess:async e=>audits.push(e),queries:[{path:'/preview',method:'POST',schema:{type:'object',additionalProperties:false,required:['quantity'],properties:{quantity:{type:'integer',minimum:1},deny:{type:'boolean'}}},run:async(c,_q,body)=>({quantity:body.quantity,providerIdentity:c.providerIdentity??null,approvalPrincipals:c.approvalPrincipals??null,immutable:c.providerIdentity?Object.isFrozen(c.providerIdentity):true,report:{version:2,groups:[]}})},{path:'/legacy',run:async()=>({legacy:true})}]};
 const app=createBusinessServer(pool,'secret',runtime,definition,async()=>1,async()=>{});
 const headers={authorization:'Bearer secret','x-steward-actor':actor,'x-steward-permissions':JSON.stringify(['test.pricing.read'])};
 const snapshot={issuedAt:Date.now(),reviewerPermission:'test.pricing.review',actors:[actor]};
 return{app,sql,audits,accesses,definition,providerIdentity,runtime,manifest,snapshot,headers,request:(body,extra={})=>app.inject({method:'POST',url:'/preview',headers:{...headers,...extra},payload:body})};
}
test('typed POST preview preserves trusted provenance, policy authorization, read-only transaction and access audit',async()=>{
 const f=fixture();try{const response=await f.request({quantity:2},{'x-steward-provider-identity':JSON.stringify({...f.providerIdentity,moduleInstallationId:randomUUID()}),'x-steward-approval-principals':JSON.stringify(f.snapshot)});assert.equal(response.statusCode,200,response.body);const result=response.json();assert.deepEqual(result.providerIdentity,f.providerIdentity);assert.equal(result.immutable,true);assert.deepEqual(result.approvalPrincipals,f.snapshot);assert.equal(result.quantity,2);assert(f.sql.includes('BEGIN READ ONLY'));assert.equal(f.accesses[0].operation,'query');assert.deepEqual(f.accesses[0].input,{quantity:2});assert(f.audits.some(e=>e.method==='POST'&&e.allowed));assert(!JSON.stringify(f.audits).includes('quantity'));}finally{await f.app.close();}
});
test('preview rejects unauthorized, malformed, extra and coercible fields and rolls back denied data access',async()=>{
 const f=fixture();try{for(const input of [{quantity:'2'},{quantity:0},{quantity:2,providerIdentity:f.providerIdentity},{quantity:2,unknown:true}])assert.equal((await f.request(input)).statusCode,400);assert.equal((await f.request({quantity:2},{'x-steward-permissions':'[]'})).statusCode,403);assert.equal((await f.request({quantity:2,deny:true})).statusCode,403);assert(f.sql.includes('ROLLBACK'));assert(f.audits.some(e=>!e.allowed));}finally{await f.app.close();}
});
test('approval context rejects stale, future, duplicate, wrong-permission and malformed snapshots',async()=>{
 const f=fixture();try{for(const value of [{...f.snapshot,issuedAt:Date.now()-61000},{...f.snapshot,issuedAt:Date.now()+10000},{...f.snapshot,actors:[...f.snapshot.actors,...f.snapshot.actors]},{...f.snapshot,reviewerPermission:'other.review'},{...f.snapshot,actors:['admin']},{...f.snapshot,permissions:['admin']},'invalid'])assert.equal((await f.request({quantity:2},{'x-steward-approval-principals':typeof value==='string'?value:JSON.stringify(value)})).statusCode,403);assert.equal((await f.request({quantity:2})).json().approvalPrincipals,null);}finally{await f.app.close();}
});
test('legacy runtimes and GET queries remain compatible; approval snapshots require opt-in',async()=>{
 const f=fixture({identity:false,approval:false});try{const result=await f.request({quantity:2});assert.equal(result.statusCode,200);assert.equal(result.json().providerIdentity,null);assert.equal((await f.request({quantity:2},{'x-steward-approval-principals':JSON.stringify(f.snapshot)})).statusCode,403);assert.equal((await f.app.inject({method:'GET',url:'/legacy',headers:f.headers})).json().legacy,true);}finally{await f.app.close();}
});
test('runtime provenance rejects mixed identities rather than trusting configuration',()=>{
 const f=fixture();try{for(const key of ['workerInstallationId','entityId','moduleInstallationId','moduleId','packageDigest']){const changed={...f.runtime,providerIdentity:{...f.providerIdentity,[key]:key==='moduleId'?'other.provider':'invalid'}};assert.throws(()=>createBusinessServer({},'secret',changed,{manifest:f.manifest,resources:[],actions:[]},async()=>1,async()=>{}),/Module provider identity unavailable/);}}finally{void f.app.close();}
});
test('preview audit failure withholds result without implying a committed mutation',async()=>{
 const f=fixture();try{f.definition.auditAccess=async()=>{throw Error('unavailable');};const result=await f.request({quantity:2});assert.equal(result.statusCode,503);assert.deepEqual(result.json(),{error:'Module access audit unavailable'});}finally{await f.app.close();}
});
test('POST previews require closed module-owned schemas at registration',()=>{
 const f=fixture();try{for(const schema of [undefined,{type:'object',properties:{}},{type:'string'}])assert.throws(()=>createBusinessServer({},'secret',f.runtime,{...f.definition,queries:[{path:'/preview',method:'POST',schema,run:async()=>({})}]},async()=>1,async()=>{}),/POST query requires a closed input schema/);}finally{void f.app.close();}
});
