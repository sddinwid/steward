// Isolated PostgreSQL/auth/route integration. No operator databases or secrets mounted.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import Fastify from 'fastify';
import {PostgresDatabase} from '../packages/platform/dist/database.js';
import {authentication} from '../packages/platform/dist/security/auth.js';
import {passwordHash} from '../packages/platform/dist/security/crypto.js';
import {synchronizationRoutes} from '../packages/platform/dist/synchronization.js';
import {scientificRoutes} from '../packages/platform/dist/scientific.js';
import {ScientificError} from '../packages/platform/dist/scientific-client.js';
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const password=randomBytes(32).toString('hex'),name='steward-science-db-test-'+randomUUID();let container,db,app,checks=0;
const origin='https://master.localhost',identity={configVersion:1,role:'master',installationId:randomUUID(),entity:{entityId:randomUUID(),displayName:'Scientific governance test'}};
try{
 container=docker(['run','-d','--name',name,'--network','bridge','-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD='+password,'--tmpfs','/var/lib/postgresql/data:rw,size=128m','postgres:17.10-alpine']);
 const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort);
 db=new PostgresDatabase({host:'127.0.0.1',port,user:'postgres',password,database:'postgres'},identity);
 let ready=false;for(let n=0;n<80;n++){try{await db.pool.query('SELECT 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}assert(ready);
 await db.migrate();await db.migrate();await db.check();checks++;
 const entities=[randomUUID(),randomUUID(),randomUUID()],ids={registry:randomUUID(),scoped:randomUUID(),viewer:randomUUID()},loginPassword='test-only-'+randomUUID();
 for(const e of entities)await db.pool.query("INSERT INTO legal_entities(entity_id,name,classification,enrollment_eligible) VALUES($1,$2,'test',true)",[e,'Test '+e.slice(0,6)]);
 for(const [label,id]of Object.entries(ids))await db.pool.query('INSERT INTO security_accounts(account_id,username,password_hash,role) VALUES($1,$2,$3,$4)',[id,label,await passwordHash(loginPassword),{registry:'registry_admin',scoped:'enrollment_admin',viewer:'viewer'}[label]]);
 await db.pool.query('INSERT INTO entity_authorizations VALUES($1,$2)',[ids.scoped,entities[0]]);
 app=Fastify();const auth=authentication(app,db.pool,origin);
 await synchronizationRoutes(app,db.pool,auth,identity,'unused-until-signed-delivery',{publicOrigin:origin});
 let mode='unavailable',calls=0;
 const client={async analyze(input,signal){calls++;if(mode==='wait')return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new ScientificError('SCIENTIFIC_CANCELED')),{once:true}));throw new ScientificError('SCIENTIFIC_UNAVAILABLE');}};
 await scientificRoutes(app,db.pool,auth,origin,client);
 async function login(username){const r=await app.inject({method:'POST',url:'/api/v2/auth/login',headers:{origin,'content-type':'application/json'},payload:{username,password:loginPassword}});assert.equal(r.statusCode,200);return{origin,'content-type':'application/json',cookie:r.headers['set-cookie'].split(';')[0],'x-csrf-token':r.json().csrfToken};}
 const admin=await login('registry'),scoped=await login('scoped'),viewer=await login('viewer');
 async function api(method,url,payload,headers=admin,status=200){const r=await app.inject({method,url,headers,...(payload?{payload}:{})});assert.equal(r.statusCode,status,JSON.stringify({url,status:r.statusCode,error:r.json().error}));checks++;return r.json();}
 await api('GET','/api/v4/scientific',undefined,{},401);
 await api('GET','/api/v4/scientific',undefined,viewer,403);
 const body={entityIds:entities.slice(0,2),basis:'synthetic-analytical-history'};
 await api('POST','/api/v4/scientific/datasets',body,scoped,403);
 await api('POST','/api/v4/scientific/datasets',{...body,entityIds:[entities[0],randomUUID()]},admin,403);
 const d=(await api('POST','/api/v4/scientific/datasets',body)).dataset;
 const again=(await api('POST','/api/v4/scientific/datasets',body)).dataset;assert.equal(d.dataset_id,again.dataset_id);assert(!('entityKey' in d.content.series[0]));
 await api('GET','/api/v4/scientific/datasets/'+d.dataset_id,undefined,scoped,404);
 assert.equal((await api('GET','/api/v4/scientific',undefined,scoped)).datasets.length,0);
 const job={jobId:randomUUID(),datasetId:d.dataset_id,capability:'demand-forecast',options:{horizon:30}};
 await api('POST','/api/v4/scientific/runs',job,{...admin,'x-csrf-token':'bad'},403);
 await api('POST','/api/v4/scientific/runs',job,scoped,404);
 await api('POST','/api/v4/scientific/runs',job,admin,202);
 let final;for(let n=0;n<50;n++){final=await api('GET','/api/v4/scientific/runs/'+job.jobId);if(final.run.state!=='running')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(final.run.state,'failed');assert.equal(final.run.error_code,'SCIENTIFIC_UNAVAILABLE');assert.equal(final.run.result,null);
 const count=calls;await api('POST','/api/v4/scientific/runs',job);assert.equal(calls,count);
 await api('POST','/api/v4/scientific/runs',{...job,options:{horizon:31}},admin,409);
 await api('GET','/api/v4/scientific/runs/'+job.jobId,undefined,scoped,404);
 await api('POST','/api/v4/scientific/runs/'+job.jobId+'/finding',{reviewed:true},admin,422);
 mode='wait';const one={...job,jobId:randomUUID()},two={...job,jobId:randomUUID()};
 await api('POST','/api/v4/scientific/runs',one,admin,202);await api('POST','/api/v4/scientific/runs',two,admin,202);
 await api('POST','/api/v4/scientific/runs',{...job,jobId:randomUUID()},admin,429);
 await api('POST','/api/v4/scientific/runs/'+one.jobId+'/cancel',{},scoped,404);
 await api('POST','/api/v4/scientific/runs/'+one.jobId+'/cancel',{});
 await api('POST','/api/v4/scientific/runs/'+two.jobId+'/cancel',{});
 assert.equal((await api('GET','/api/v4/scientific/runs/'+one.jobId)).run.state,'canceled');
 await api('GET','/api/v4/analytics');await api('GET','/api/v4/simulation-intelligence');
 await new Promise(r=>setTimeout(r,100));
 await db.pool.query("INSERT INTO scientific_runs(job_id,dataset_id,request_digest,entity_ids,capability,request,state,created_by) VALUES($1,$2,'interrupted',$3,'demand-forecast','{}','running',$4)",[randomUUID(),d.dataset_id,body.entityIds,ids.registry]);
 await app.close();app=Fastify();await scientificRoutes(app,db.pool,auth,origin,client);
 assert.equal((await db.pool.query("SELECT count(*)::int n FROM scientific_runs WHERE state='running'")).rows[0].n,0);checks++;
 assert.equal((await db.pool.query("SELECT count(*)::int n FROM scientific_runs WHERE state='interrupted'")).rows[0].n,1);checks++;
 console.log(JSON.stringify({status:'passed',checks,realPostgresql:true,realAuthentication:true,scope:true,idempotency:true,capacity:true,cancellation:true,outage:true,restartRecovery:true,operatorDataAccess:false}));
}finally{if(app)await app.close();if(db)await db.close();if(container)docker(['rm','-f',container]);}
