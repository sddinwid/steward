import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import type {ModulePackageManifest} from '@steward/module-sdk';
import {approvalAuthorityHeaders,financialAuthorityHeaders,publicContextHeaders} from './financial-context.js';

const manifest={moduleId:'test.pricing',api:[{permission:'test.pricing.review'}],approvalServices:{contractVersion:1,reviewerPermission:'test.pricing.review'}} as ModulePackageManifest;
function db(query:(sql:string,args?:unknown[])=>unknown){return{query:async(sql:string,args?:unknown[])=>query(sql,args)} as unknown as Pick<pg.Pool,'query'>;}
test('approval snapshot uses declared review permission and fresh enabled Worker accounts without economic metadata',async()=>{
 const actor=randomUUID();let calls=0;
 const connection=db((sql,args)=>{calls++;assert.match(sql,/a\.enabled/);assert.match(sql,/a\.role='local_admin'/);assert.match(sql,/a\.role='module_user'/);assert.match(sql,/module_permissions/);assert.match(sql,/LIMIT 257/);assert.deepEqual(args,['test.pricing','test.pricing.review']);return{rows:[{account_id:actor}]};});
 const first=JSON.parse((await approvalAuthorityHeaders(connection,manifest))['x-steward-approval-principals']!);
 assert.deepEqual(first.actors,[actor]);assert.equal(first.reviewerPermission,'test.pricing.review');assert(Math.abs(Date.now()-first.issuedAt)<1000);
 await approvalAuthorityHeaders(connection,manifest);assert.equal(calls,2);
});
test('approval snapshots are opt-in, closed to undeclared review permissions, and bounded',async()=>{
 const unused=db(()=>{throw Error('unexpected query');});assert.deepEqual(await approvalAuthorityHeaders(unused,{...manifest,approvalServices:undefined} as unknown as ModulePackageManifest),{});
 await assert.rejects(approvalAuthorityHeaders(unused,{...manifest,approvalServices:{contractVersion:1,reviewerPermission:'other.review'}}),/APPROVAL_PERMISSION_UNDECLARED/);
 await assert.rejects(approvalAuthorityHeaders(db(()=>({rows:Array.from({length:257},()=>({account_id:randomUUID()}))})),manifest),/APPROVAL_PRINCIPAL_LIMIT_REACHED/);
});
test('host strips private snapshots case-insensitively and preserves ordinary context',()=>{
 assert.deepEqual(publicContextHeaders({'X-Steward-Approval-Principals':'forged','x-steward-financial-principals':'forged','x-steward-actor':'actor'}),{'x-steward-actor':'actor'});
});
test('existing financial snapshot remains gated by economicServices and admin permission',async()=>{
 assert.deepEqual(await financialAuthorityHeaders(db(()=>({rows:[{descriptor:{payload:{manifest}}}]})),'test.pricing'),{});
 let calls=0;const actor=randomUUID();const headers=await financialAuthorityHeaders(db((_sql,args)=>{if(calls++===0)return{rows:[{descriptor:{payload:{manifest:{economicServices:{}}}}}]};assert.deepEqual(args,['test.finance','test.finance.admin']);return{rows:[{account_id:actor}]};}),'test.finance');
 assert.deepEqual(JSON.parse(headers['x-steward-financial-principals']!).actors,[actor]);
});
