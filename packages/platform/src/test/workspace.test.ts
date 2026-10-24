import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {parseConfig} from '../config.js';
import {randomUUID} from 'node:crypto';
import {workspaceRoutes,validatePreferences} from '../workspace.js';
import type {SecureApp,Authentication} from '../security/auth.js';
import type pg from 'pg';
const valid={country:'US',baseCurrency:'USD',locale:'en-US',timezone:'America/New_York'};
test('localization validates country/currency/locale/timezone and rejects extra conversion instructions',()=>{
 assert.deepEqual(validatePreferences(valid),valid);
 assert.deepEqual(validatePreferences({...valid,country:'DE',baseCurrency:'EUR'}).baseCurrency,'EUR');
 for(const b of [{...valid,baseCurrency:'usd'},{...valid,timezone:'not/a/zone'},{...valid,locale:'not_locale'},{...valid,convertHistory:true},null])assert.throws(()=>validatePreferences(b));
});
test('Worker profile resolves enrolled identity, and preferences reject another company and ordinary user writes',async()=>{
 const installed=randomUUID(),enrolled=randomUUID();let role='module_user';
 const queries:string[]=[];
 const pool={query:async(sql:string)=>{queries.push(sql);return {rows:sql.includes('FROM local_enrollment')?[{entity_id:enrolled,entity_name:'Enrolled company',state:'enrolled'}]:[],rowCount:0};}} as unknown as pg.Pool;
 const auth={session:async()=>({account_id:randomUUID(),username:'operator',role})} as unknown as Authentication;
 const app=Fastify();workspaceRoutes(app as unknown as SecureApp,pool,auth,parseConfig({configVersion:1,role:'worker',installationId:randomUUID(),entity:{entityId:installed,displayName:'Bootstrap runtime'}},'worker'));
 try{
  const profile=(await app.inject('/api/v2/workspace/profile')).json();assert.equal(profile.name,'Enrolled company');assert.equal(profile.entityId,enrolled);assert.equal(profile.administrator,false);assert.equal(profile.preferences,null);
  assert.equal((await app.inject({method:'PUT',url:'/api/v2/entities/'+enrolled+'/preferences',payload:valid})).statusCode,403);
  role='local_admin';assert.equal((await app.inject({method:'PUT',url:'/api/v2/entities/'+installed+'/preferences',payload:valid})).statusCode,403);
  assert.equal((await app.inject('/api/v2/entities/'+enrolled+'/preferences')).statusCode,200);
  assert.equal(queries.some(q=>/UPDATE|INSERT|DELETE/.test(q)),false);
 }finally{await app.close();}
});
