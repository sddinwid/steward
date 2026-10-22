import { test } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createOperationsServer } from '../server.js';
test('operational APIs require gateway authentication and validate capacity before persistence',async()=>{
 let called=false;const pool={query:async()=>{called=true;return{rows:[]};}} as unknown as pg.Pool;
 const app=createOperationsServer(pool,'test-gateway-credential',async()=>1,async()=>{},'EUR');
 try{assert.equal((await app.inject('/capacities')).statusCode,401);assert.equal((await app.inject({method:'POST',url:'/capacities',headers:{authorization:'Bearer test-gateway-credential'},payload:{name:'Capacity',site:'Site',capacity_m3:10,utilized_m3:11,monthly_operating_cost:1,currency:'EUR'}})).statusCode,400);assert.equal(called,false);}finally{await app.close();}
});
test('asset operations use their own table and reject stale revisions',async()=>{
 const queries:string[]=[];const pool={query:async(query:string)=>{queries.push(query);return{rows:[]};}} as unknown as pg.Pool;
 const app=createOperationsServer(pool,'test-gateway-credential',async()=>1,async()=>{},'EUR');
 try{assert.equal((await app.inject({url:'/assets',headers:{authorization:'Bearer test-gateway-credential'}})).statusCode,200);assert.ok(queries[0]?.includes('FROM warehouse_assets'));assert.equal((await app.inject({method:'PUT',url:'/assets/11111111-1111-4111-8111-111111111111',headers:{authorization:'Bearer test-gateway-credential'},payload:{name:'Asset',site:'Site',capacity_m3:100,utilized_m3:10,monthly_operating_cost:1,currency:'EUR',revision:1}})).statusCode,409);}finally{await app.close();}
});
