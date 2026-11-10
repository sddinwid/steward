// Isolated PostgreSQL + actual module API/background; never touches operator data.
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { createBusinessServer, transaction, find, save } from '../packages/business-kit/dist/index.js';
import { validateManifest, resolveCapability } from '../packages/module-sdk/dist/index.js';
import { carrierSimulator, carrierBackgroundWith, syntheticTransport, MODULE } from '../modules/carrier-simulator/dist/definition.js';

const runId=randomUUID(),container='steward-carrier-test-'+runId,directory='.steward/carrier-tests/'+runId;
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const password=randomBytes(32).toString('hex'),token=randomBytes(32).toString('hex');
const report={scope:'Synthetic isolated PostgreSQL/module acceptance, not a live carrier',checks:[]};
let pool,app;
await mkdir(directory,{recursive:true});await writeFile(directory+'/postgres.env','POSTGRES_PASSWORD='+password+'\n',{mode:0o600});
const check=async(name,fn)=>{await fn();report.checks.push(name);console.log('PASS '+name);};
try{
  docker(['run','--rm','-d','--name',container,'--env-file',directory+'/postgres.env','-p','127.0.0.1::5432','postgres:17.10-alpine']);
  const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort);
  pool=new pg.Pool({host:'127.0.0.1',port,user:'postgres',password,database:'postgres',connectionTimeoutMillis:1000});
  for(let i=0;;i++){try{await pool.query('SELECT 1');break;}catch(e){if(i>40)throw e;await delay(300);}}
  const manifest=JSON.parse(await readFile('modules/carrier-simulator/manifest.json','utf8'));validateManifest(manifest);
  const runtime={installationId:randomUUID(),entityId:randomUUID(),configuration:{mode:'simulator'}};
  runtime.providerIdentity={workerInstallationId:runtime.installationId,entityId:runtime.entityId,moduleId:MODULE,moduleInstallationId:randomUUID(),packageDigest:'a'.repeat(64)};
  const allowed=[...new Set(manifest.api.map(a=>a.permission))],definition=carrierSimulator(manifest);
  const context=db=>({db,config:runtime.configuration,installationId:runtime.installationId,entityId:runtime.entityId,providerIdentity:runtime.providerIdentity,moduleId:MODULE,actor:'fixture',permissions:allowed});
  await transaction(pool,async db=>{await db.query(await readFile('modules/carrier-simulator/migrations/001-carrier.sql','utf8'));await definition.afterMigrate(context(db));});
  const start=()=>createBusinessServer(pool,token,runtime,definition,async()=>1,async()=>{});app=start();
  const request=async(method,url,body,code=200,permissions=allowed)=>{const r=await app.inject({method,url,headers:{authorization:'Bearer '+token,'x-steward-actor':'fixture','x-steward-permissions':JSON.stringify(permissions)},...(body?{payload:body}:{})});assert.equal(r.statusCode,code,url+': '+r.body);return r.json();};
  const shipment=async id=>(await request('GET','/shipments?q='+id)).records[0];
  const action=async(name,r,body={revision:r.revision,requestId:randomUUID()},code=200,permissions=allowed)=>request('POST','/'+name+'/'+r.id,body,code,permissions);
  const create=async reference=>(await request('POST','/registrations',{reference,trackingNumber:'SIM-'+reference.toUpperCase()},201)).record;
  let time=Date.now(),calls=0;const background=carrierBackgroundWith(async(...args)=>{calls++;return syntheticTransport(...args);},()=>time);
  const sync=async id=>{await action('sync-tracking',await shipment(id));time=Math.max(time,Date.now())+1;await background(pool,runtime);return shipment(id);};
  let primary;
  await check('manifest: signed SSMA contracts resolve only with same entity and permission',async()=>{
    const cap=manifest.smart.provides.find(c=>c.capabilityId==='shipping.tracking.sync'),req=manifest.smart.consumes[0];
    const provider={moduleId:MODULE,packageDigest:'a'.repeat(64),entityId:runtime.entityId,state:'active',configured:true,capability:cap};
    assert.equal(resolveCapability(req,[provider],{entityId:runtime.entityId,permissions:allowed}).state,'resolved');
    assert.equal(resolveCapability(req,[provider],{entityId:randomUUID(),permissions:allowed}).state,'unavailable');
    assert.equal(resolveCapability(req,[provider],{entityId:runtime.entityId,permissions:[]}).state,'unavailable');
  });
  await check('registration: local only, retry stable identity, changed input rejected',async()=>{
    primary=await create('acceptance');const before=calls;
    const again=await create('acceptance');assert.equal(again.id,primary.id);assert.equal(calls,before);
    await request('POST','/registrations',{reference:'acceptance',trackingNumber:'SIM-DIFFERENT'},409);
    assert.equal((await pool.query('SELECT * FROM carrier_provider')).rowCount,1);
  });
  await check('authorization: read does not confer register, simulation or sync permission',async()=>{
    const read=[MODULE+'.read'];await request('POST','/registrations',{reference:'denied',trackingNumber:'SIM-DENIED'},403,read);
    for(const name of ['advance','sync-tracking','governed-sync'])await action(name,await shipment(primary.id),undefined,403,read);
    await request('GET','/shipments',undefined,403,[]);
    await request('POST','/registrations',{reference:'bad',trackingNumber:'LIVE-TRACK'},400);
    await request('POST','/registrations',{reference:'bad',trackingNumber:'SIM-BAD',entityId:randomUUID()},400);
  });
  await check('simulator: durable lifecycle reaches delivery with immutable evidence',async()=>{
    let r=await sync(primary.id);assert.equal(r.status,'announced');
    for(const expected of ['in_transit','out_for_delivery','delivered']){await action('advance',r);r=await sync(primary.id);assert.equal(r.status,expected);}
    assert.equal(r.shipmentDelivered,null);assert.equal((await request('GET','/events?q='+r.id)).records.length,4);
  });
  await check('duplicate: exact provider replay retains one event and multiple retrieval receipts',async()=>{
    const count=(await pool.query('SELECT count(*) FROM carrier_observations')).rows[0].count;
    await action('duplicate',await shipment(primary.id));await sync(primary.id);
    assert.equal((await pool.query('SELECT count(*) FROM carrier_observations')).rows[0].count,count);
    assert(Number((await pool.query('SELECT count(*) FROM carrier_receipts')).rows[0].count)>Number(count));
  });
  await check('out-of-order: late event cannot regress delivered summary',async()=>{await action('late',await shipment(primary.id));assert.equal((await sync(primary.id)).status,'delivered');});
  await check('correction: explicit correction of delivered observation retained and applied',async()=>{
    // Advance a separate shipment; do not correct the late event in the earlier scenario.
    const r=await create('correction');await sync(r.id);for(let i=0;i<3;i++){await action('advance',await shipment(r.id));await sync(r.id);}
    await action('correct',await shipment(r.id));assert.equal((await sync(r.id)).status,'exception');
    assert((await request('GET','/events?q='+r.id)).records.some(e=>e.status==='delivered'));
  });
  await check('conflict and missing-time: preserve uncertainty instead of invented resolution',async()=>{
    for(const name of ['conflict','unknown-time']){const r=await create(name);await sync(r.id);await action(name,await shipment(r.id));assert.equal((await sync(r.id)).reconciliation,'ambiguous');}
  });
  await check('partial: retain prior evidence, do not advance complete-success freshness',async()=>{
    const r=await create('partial');const before=await sync(r.id);await action('advance',before);await action('partial',await shipment(r.id));time+=100;
    const after=await sync(r.id);assert.equal(after.coverage,'partial_response');assert.equal(after.lastSuccessfulSyncAt,before.lastSuccessfulSyncAt);assert.equal(after.freshUntil,null);
  });
  await check('outage and throttling: bounded stored retry recovers, reads never poll',async()=>{
    for(const kind of ['outage','throttle']){const r=await create(kind);const before=await sync(r.id);await action(kind,before);await sync(r.id);
      const jobs=(await pool.query("SELECT * FROM carrier_jobs WHERE registration_id=$1 AND state='retry'",[r.id])).rows;assert.equal(jobs.length,1);
      const callsBefore=calls;await request('GET','/events?q='+r.id);await request('GET','/shipments?q='+r.id);await request('GET','/exceptions');assert.equal(calls,callsBefore);
      await action('recover',await shipment(r.id));time=new Date(jobs[0].next_at).getTime()+1;for(let i=0;i<10;i++)await background(pool,runtime);assert.equal((await shipment(r.id)).syncError,null);
    }
  });
  await check('config-race: obsolete in-flight results are discarded',async()=>{
    const r=await create('generation');await action('sync-tracking',r);time=Math.max(time,Date.now())+1;
    await carrierBackgroundWith(async(...args)=>{const conn=(await request('GET','/connections')).records[0];await action('advance-generation',conn);return syntheticTransport(...args);},()=>time)(pool,runtime);
    assert.equal((await shipment(r.id)).lastSuccessfulSyncAt,null);assert.equal((await request('GET','/attempts?q='+r.id)).records[0].outcome,'superseded');
  });
  await check('restart-retry: expired lease recovered and duplicate action receipt is stable',async()=>{
    const r=await create('restart'),body={revision:r.revision,requestId:randomUUID()};const a=await action('sync-tracking',r,body),b=await action('sync-tracking',r,body);assert.deepEqual(a,b);
    const aid=randomUUID();await pool.query('INSERT INTO carrier_attempts(id,registration_id,data) VALUES($1,$2,$3)',[aid,r.id,{outcome:'running'}]);
    await pool.query("UPDATE carrier_jobs SET state='running',attempt_id=$2,attempts=1,lease_until=$3 WHERE registration_id=$1",[r.id,aid,new Date(time-1)]);
    await app.close();app=start();await background(pool,runtime);assert.equal((await shipment(r.id)).status,'announced');
    assert.equal((await pool.query('SELECT data FROM carrier_attempts WHERE id=$1',[aid])).rows[0].data.outcome,'interrupted');
  });
  await check('scope and tracking reuse: registration cycles stay distinct; foreign runtime reads blocked',async()=>{
    const a=await create('reuse-a'),b=(await request('POST','/registrations',{reference:'reuse-b',trackingNumber:'SIM-REUSE-A'},201)).record;assert.notEqual(a.id,b.id);assert.notEqual(a.identity,b.identity);
    const other={...runtime,entityId:randomUUID()};other.providerIdentity={...runtime.providerIdentity,entityId:other.entityId};const foreign=createBusinessServer(pool,token,other,definition,async()=>1,async()=>{});
    const result=await foreign.inject({method:'GET',url:'/events?q='+a.id,headers:{authorization:'Bearer '+token,'x-steward-permissions':JSON.stringify(allowed)}});assert.equal(result.statusCode,403);await foreign.close();
  });
  await check('pagination and private schema boundaries',async()=>{
    await request('GET','/shipments?limit=21',undefined,400);await request('GET','/events?q=not-a-uuid',undefined,400);
    const p=await request('GET','/shipments?limit=2');assert.equal(p.records.length,2);assert.equal(p.nextOffset,2);
    assert(!JSON.stringify(await request('GET','/events')).includes('clientSecret'));
  });
  await writeFile(directory+'/report.json',JSON.stringify({...report,status:'passed'},null,2));console.log('PASS '+report.checks.length+' carrier integration checks');
}catch(e){await writeFile(directory+'/report.json',JSON.stringify({...report,status:'failed',error:String(e.message)},null,2));throw e;}
finally{if(app)await app.close();if(pool)await pool.end();try{docker(['rm','-f',container]);}catch{}}
