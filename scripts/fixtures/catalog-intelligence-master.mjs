// Isolated real Master API/session/CSRF/PostgreSQL and signed Worker exchanges.
// Published records are explicit typed source fixtures, not a deployed module-flow claim.
import assert from 'node:assert/strict';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {randomUUID,randomBytes,generateKeyPairSync} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import Fastify from 'fastify';
import {PostgresDatabase} from '../../packages/platform/dist/database.js';
import {authentication} from '../../packages/platform/dist/security/auth.js';
import {passwordHash,hash,publicKey,signAssertion} from '../../packages/platform/dist/security/crypto.js';
import {mcpRoutes} from '../../packages/platform/dist/mcp.js';
import {analystRoutes} from '../../packages/platform/dist/analyst.js';
import {missionMasterRoutes} from '../../packages/platform/dist/mission-routes.js';
import {catalogIntelligenceRoutes} from '../../packages/platform/dist/catalog-intelligence-routes.js';
import {synchronizationRoutes,batchEvents} from '../../packages/platform/dist/synchronization.js';
import {privateDirectory} from '../../tools/installer/dist/security.js';
import {makeIntelligenceRecords} from './intelligence-records.mjs';

export async function createCatalogMasterFixture(options={}){
 const root=path.resolve('.steward/phase15-master-tests'),directory=path.join(root,randomUUID()),container='steward-catalog-master-'+randomUUID(),password=randomBytes(32).toString('base64url');
 const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 let db,app,started=false;const origin=options.origin??'https://master.localhost',identity={configVersion:1,role:'master',installationId:randomUUID(),entity:{entityId:randomUUID(),displayName:'Isolated Catalog intelligence fixture'}};
 const key=()=>generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}).toString(),masterKey=key();
 async function cleanup(){await app?.close();await db?.close();if(started)docker(['rm','-f',container]);assert(directory.startsWith(root+path.sep));await rm(directory,{recursive:true,force:true});}
 try{
  await mkdir(directory,{recursive:true});privateDirectory(directory);await writeFile(path.join(directory,'db.env'),'POSTGRES_PASSWORD='+password+'\n',{mode:0o600});docker(['run','--rm','-d','--name',container,'--env-file',path.join(directory,'db.env'),'-p','127.0.0.1::5432','postgres:17.10-alpine']);started=true;
  const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort);db=new PostgresDatabase({host:'127.0.0.1',port,user:'postgres',password,database:'postgres'},identity);
  for(let i=0;;i++){try{await db.pool.query('SELECT 1');break;}catch(e){if(i===60)throw e;await delay(250);}}await db.migrate();
  const data=await makeIntelligenceRecords(),actors={registry:randomUUID(),scoped:randomUUID(),unscoped:randomUUID(),disabled:randomUUID()},loginPassword=randomBytes(24).toString('base64url');
  for(const[name,id]of Object.entries(actors))await db.pool.query('INSERT INTO security_accounts(account_id,username,password_hash,role,enabled) VALUES($1,$2,$3,$4,$5)',[id,'fixture-'+name,await passwordHash(loginPassword),name==='registry'||name==='disabled'?'registry_admin':'enrollment_admin',name!=='disabled']);
  for(const e of data.entities)await db.pool.query("INSERT INTO legal_entities(entity_id,name,classification,enrollment_eligible) VALUES($1,$2,'isolated-fixture',true)",[e.entityId,e.name]);
  await db.pool.query('INSERT INTO entity_authorizations(account_id,entity_id) VALUES($1,$2)',[actors.scoped,data.entities[0].entityId]);
  const keys=new Map();for(const w of data.workers){const privateKey=key(),pub=publicKey(privateKey),requestId=randomUUID();keys.set(w.installationId,privateKey);await db.pool.query('INSERT INTO worker_candidates VALUES($1,$2,$3)',[w.installationId,pub,hash(pub)]);await db.pool.query("INSERT INTO enrollment_requests(request_id,installation_id,user_code,status,entity_id,expires_at) VALUES($1,$2,$3,'enrolled',$4,now()+interval '1 hour')",[requestId,w.installationId,randomUUID(),w.entityId]);await db.pool.query('INSERT INTO enrolled_workers(installation_id,entity_id,key_thumbprint,request_id,certificate) VALUES($1,$2,$3,$4,$5)',[w.installationId,w.entityId,hash(pub),requestId,{}]);}
  app=Fastify(options.appOptions??{});app.setErrorHandler((e,_req,reply)=>reply.code(e.code==='23505'?409:e.statusCode??500).send({error:e.statusCode&&e.statusCode<500?e.message:'Request failed'}));const auth=authentication(app,db.pool,origin);await catalogIntelligenceRoutes(app,db.pool,auth,identity,options.science);await synchronizationRoutes(app,db.pool,auth,identity,masterKey,{publicOrigin:origin});
  if(options.mcp){await missionMasterRoutes(app,db.pool,auth,identity,options.science);await mcpRoutes(app,db.pool,auth,identity,origin);}
  if(options.analyst)await analystRoutes(app,db.pool,auth,{publicOrigin:origin,...options.analystSecurity});
  if(options.configureApp)await options.configureApp({app,db,auth,identity,origin,directory});
  async function login(name){const r=await app.inject({method:'POST',url:'/api/v2/auth/login',headers:{origin,'content-type':'application/json'},payload:{username:'fixture-'+name,password:loginPassword}});assert.equal(r.statusCode,200,r.body);return{origin,'content-type':'application/json',cookie:r.headers['set-cookie'].split(';')[0],'x-csrf-token':r.json().csrfToken};}
  const headers={registry:await login('registry'),scoped:await login('scoped'),unscoped:await login('unscoped')};
  async function request(method,url,payload,which='registry',expected=200){const r=await app.inject({method,url,headers:typeof which==='string'?headers[which]:which,...(payload===undefined?{}:{payload})});assert.equal(r.statusCode,expected,r.body);return r.json();}
  const wire=entry=>{const ref=entry.reference,p=entry.projection,e=data.entities.find(e=>e.entityId===ref.entityId);return{envelopeVersion:1,payloadVersion:1,eventId:randomUUID(),source:{configVersion:1,role:'worker',installationId:ref.installationId,entity:{entityId:ref.entityId,displayName:e.name}},destinationInstallationId:identity.installationId,sequence:String(ref.revision),occurredAt:p.publishedAt??new Date().toISOString(),eventType:'record.upsert',moduleId:ref.moduleId,streamId:ref.streamId,recordId:ref.recordId,recordRevision:ref.revision,payload:{id:ref.recordId,revision:ref.revision,projection:p}};};
  async function exchange(events,expected=200){assert(events.length);const worker=events[0].source.installationId;assert(events.every(e=>e.source.installationId===worker));const response=await app.inject({method:'POST',url:'/api/v4/sync/exchange',headers:{'content-type':'application/json'},payload:signAssertion({protocol:'steward-sync-v1',installationId:worker,entityId:events[0].source.entity.entityId,nonce:randomUUID(),issuedAt:Date.now(),events,acknowledgments:[]},keys.get(worker))});assert.equal(response.statusCode,expected,response.body);return response.json();}
  async function seed(entries=data.records){for(const w of data.workers){const pending=entries.filter(r=>r.reference.installationId===w.installationId).map(wire);while(pending.length){const batch=batchEvents(pending);assert(batch.length,'Each fixture event must fit the real synchronization budget');await exchange(batch);pending.splice(0,batch.length);}}}
  if(options.seed!==false)await seed();
  return{app,db,identity,origin,data,actors,headers,request,wire,exchange,seed,cleanup,loginPassword};
 }catch(e){await cleanup();throw e;}
}
