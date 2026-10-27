// Real isolated PostgreSQL/private HTTP. Host identities are explicit fixtures;
// this does not establish installed-host or browser acceptance.
import {execFileSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createBusinessServer} from '../packages/business-kit/dist/index.js';
import {moduleServiceOperations,moduleServicesCapability,validateModuleServiceDefinition} from '../packages/catalog-kit/dist/index.js';
import {housingManagement} from '../modules/housing-management/dist/definition.js';
import {foodServices} from '../modules/services-food/dist/definition.js';
import {workforce} from '../modules/workforce/dist/definition.js';
import {privateDirectory} from '../tools/installer/dist/security.js';
const directory='.steward/phase15-mission-reference-tests/'+randomUUID(),container='steward-mission-reference-tests-'+randomUUID(),password=randomBytes(32).toString('base64url'),token=randomBytes(32).toString('base64url'),installationId=randomUUID(),entityId=randomUUID();
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
let admin;const pools=[],apps=[];
try{
 await mkdir(directory,{recursive:true});privateDirectory(directory);await writeFile(directory+'/db.env','POSTGRES_PASSWORD='+password+'\n',{mode:0o600});
 docker(['run','--rm','-d','--name',container,'--env-file',directory+'/db.env','-p','127.0.0.1::5432','postgres:17.10-alpine']);
 const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort),connection={host:'127.0.0.1',port,user:'postgres',password,connectionTimeoutMillis:1000};
 admin=new pg.Pool({...connection,database:'postgres'});for(let i=0;;i++){try{await admin.query('SELECT 1');break;}catch(e){if(i===40)throw e;await delay(300);}}
 for(const [directoryName,factory,expectedKinds,legacyCommand] of [['housing-management',housingManagement,['housing'],'housing.capacity.observe'],['services-food',foodServices,['food'],'food.capacity.observe'],['workforce',workforce,['employment','training'],'workforce.training.catalog']]){
  const manifest=JSON.parse(await readFile('modules/'+directoryName+'/manifest.json','utf8')),dbName='f_'+directoryName.replaceAll('-','_');await admin.query('CREATE DATABASE '+dbName);
  const pool=new pg.Pool({...connection,database:dbName});pools.push(pool);const migrations=(await readdir('modules/'+directoryName+'/migrations')).filter(n=>/^\d{3}-.*\.sql$/.test(n)).sort();for(const m of migrations)await pool.query(await readFile('modules/'+directoryName+'/migrations/'+m,'utf8'));
  const sentinel='PRIVATE-PARTICIPANT-'+randomUUID();await pool.query("INSERT INTO business_records(id,kind,key,data) VALUES($1,'private-sentinel',$2,$3)",[randomUUID(),sentinel,{programId:randomUUID(),participantAlias:sentinel,privateCostCents:123456,privateCapacity:999}]);
  const before=(await pool.query('SELECT * FROM business_records ORDER BY id')).rows;
  const runtime={installationId,entityId,providerIdentity:{workerInstallationId:installationId,entityId,moduleId:manifest.moduleId,moduleInstallationId:randomUUID(),packageDigest:'a'.repeat(64)},configuration:{integrationsEnabled:true,syntheticOnly:true,missionSensitive:true}};
  const app=createBusinessServer(pool,token,runtime,factory(manifest),async()=>migrations.length,async()=>{});apps.push(app);
  const source={workerInstallationId:installationId,entityId,moduleId:'steward.catalog.universal',moduleInstallationId:randomUUID(),packageDigest:'b'.repeat(64)},capabilityId=moduleServicesCapability(manifest.moduleId).capabilityId;
  const invoke=async(operation,payload,{identity=source,status=200,cap=capabilityId}={})=>{const command={protocol:'steward-module-integration-v1',commandId:randomUUID(),sourceModuleId:source.moduleId,targetModuleId:manifest.moduleId,command:operation,version:1,aggregateId:randomUUID(),sequence:1,occurredAt:new Date().toISOString(),payload,capability:{capabilityId:cap,operation}};const r=await app.inject({method:'POST',url:'/integration-inbox',headers:{authorization:'Bearer '+token,'x-steward-installation':installationId,'x-steward-integration-source':source.moduleId,'x-steward-capability':cap,...(identity?{'x-steward-source-identity':JSON.stringify(identity)}:{})},payload:command});assert.equal(r.statusCode,status,directoryName+' '+r.body);assert(!r.body.includes(sentinel));return r.json();};
  await test(directoryName+': governed module interface metadata contains no programme, participant or capacity data',async()=>{
   const response=await invoke('module-services.discover',{contractVersion:1,query:'',offset:0,limit:20});assert.deepEqual(response.records.map(r=>r.kind).sort(),expectedKinds);assert.equal(response.nextOffset,null);
   for(const record of response.records){validateModuleServiceDefinition(record);assert.equal(record.availability,'unverified');assert.equal(record.programmeAuthorization,'required');const exact=await invoke('module-services.lookup',{contractVersion:1,recordId:record.recordId});assert.equal(exact.record.recordId,record.recordId);assert.equal(exact.record.definitionDigest,record.definitionDigest);}
   assert.deepEqual((await pool.query('SELECT * FROM business_records ORDER BY id')).rows,before);
  });
  await test(directoryName+': missing/foreign sender, invented authority and original mission operations fail closed',async()=>{
   const input={contractVersion:1,query:'',offset:0,limit:20};
   await invoke('module-services.discover',input,{identity:null,status:403});
   await invoke('module-services.discover',input,{identity:{...source,entityId:randomUUID()},status:403});
   await invoke('module-services.discover',input,{identity:{...source,workerInstallationId:randomUUID()},status:403});
   await invoke('module-services.discover',{...input,authorized:true,programId:randomUUID()},{status:400});
   const legacyCapability=manifest.smart.provides.find(c=>c.capabilityId!==capabilityId).capabilityId;
   if(directoryName==='workforce'){
    await invoke(legacyCommand,{programId:randomUUID(),sourceProgramId:randomUUID()},{status:409,cap:legacyCapability});
    // Explicit fixture activation isolates the existing programme/grant check.
    await pool.query('UPDATE workforce_mission_guard SET enabled=true WHERE singleton');
   }
   await invoke(legacyCommand,{programId:randomUUID(),sourceProgramId:randomUUID()},{status:403,cap:legacyCapability});
   assert.deepEqual((await pool.query('SELECT * FROM business_records ORDER BY id')).rows,before);
  });
 }
}finally{
 for(const app of apps)await app.close();for(const pool of pools)await pool.end();await admin?.end();try{docker(['rm','-f',container]);}catch{}await rm(directory,{recursive:true,force:true});
}
