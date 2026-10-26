// Controlled-clock and isolated PostgreSQL fixtures. These are not claims of
// elapsed retention in the deployed synthetic demonstration.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {businessSql} from '../packages/business-kit/dist/index.js';
import {privateDirectory} from '../tools/installer/dist/security.js';
import {elapsedHousingObservation,housingRetentionVerified} from '../modules/housing-management/dist/retention.js';
import {elapsedEmploymentObservation,employmentRetentionVerified} from '../modules/employment-pathways/dist/retention.js';
const start=Date.parse('2020-01-01T00:00:00.000Z'),day=86400000,at=n=>new Date(start+n).toISOString(),alias=()=> 'SYNREF-'+randomBytes(16).toString('hex').toUpperCase();
for(const[domain,elapsed,verified,startKey,subjectKey]of [['Housing',elapsedHousingObservation,housingRetentionVerified,'confirmedAt','placementId'],['Employment',elapsedEmploymentObservation,employmentRetentionVerified,'employedAt','pathwayId']]){
 await test(domain+' requires authoritative identity and actual elapsed 30/90-day boundaries, not reported historical starts',()=>{
  const subject={id:randomUUID(),programId:randomUUID(),participantAlias:alias(),[startKey]:at(0),requestedStartsAt:at(-90*day),effectiveStartAt:at(-90*day)},observation={programId:subject.programId,participantAlias:subject.participantAlias,[subjectKey]:subject.id,milestoneDays:30,observation:'maintained',observedAt:at(30*day),recordedAt:at(30*day),verificationStatus:'elapsed-milestone-verified'};
  assert(verified(observation,subject,start+30*day));assert(!elapsed({...observation,observedAt:at(30*day-1)},subject,start+30*day));assert(!elapsed(observation,subject,start+30*day-1));
  assert(verified({...observation,milestoneDays:90,observedAt:at(90*day),recordedAt:at(90*day)},subject,start+90*day));assert(!elapsed({...observation,milestoneDays:90},subject,start+90*day));
  assert(!elapsed({...observation,recordedAt:at(30*day-1)},subject,start+31*day));assert(!elapsed({...observation,recordedAt:at(40*day)},subject,start+31*day));assert(!elapsed({...observation,observedAt:'invalid'},subject,start+31*day));
  assert(!elapsed({...observation,milestoneDays:0},subject,start+31*day));assert(!elapsed({...observation,observation:'unknown'},subject,start+31*day));assert(elapsed({...observation,observation:'changed'},subject,start+31*day));assert(!verified({...observation,observation:'changed'},subject,start+31*day));
  for(const change of [{id:undefined},{id:randomUUID()},{programId:undefined},{programId:randomUUID()},{participantAlias:undefined},{participantAlias:alias()},{[startKey]:at(30*day)}])assert(!elapsed(observation,{...subject,...change},start+31*day));
  assert(!verified({...observation,verificationStatus:'legacy-invalid-historical-basis'},subject,start+31*day));
 });
}
const container='steward-retention-integrity-'+randomUUID(),directory='.steward/phase13-retention-tests',file=directory+'/'+randomUUID()+'.env',password=randomBytes(32).toString('base64url');await mkdir(directory,{recursive:true});privateDirectory(directory);await writeFile(file,'POSTGRES_PASSWORD='+password+'\n',{mode:0o600});const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});let admin;const pools=[];
try{
 docker(['run','--rm','-d','--name',container,'--env-file',file,'-p','127.0.0.1::5432','postgres:17.10-alpine']);const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort),config={host:'127.0.0.1',port,user:'postgres',password,connectionTimeoutMillis:1000};admin=new pg.Pool({...config,database:'postgres'});for(let n=0;;n++){try{await admin.query('SELECT 1');break;}catch(e){if(n>=30)throw e;await delay(300);}}
 for(const[name,module,kind,sourceKind,sourceKey,startKey,migration,ledger]of [['housing','housing-management','followup','placement','placementId','confirmedAt','008-followup-integrity.sql','housing_followup_integrity'],['employment','employment-pathways','retention','pathway','pathwayId','employedAt','004-retention-validation.sql','employment_retention_validation']]){
  await admin.query('CREATE DATABASE '+name);const pool=new pg.Pool({...config,database:name});pools.push(pool);await pool.query(businessSql);
  await test(name+' append-only correction quarantines invalid chronology/subjects while preserving valid evidence and original records',async()=>{
   const subjectId=randomUUID(),programId=randomUUID(),participantAlias=alias(),subject={programId,participantAlias,[startKey]:at(0),requestedStartsAt:at(-90*day),effectiveStartAt:at(-90*day)};await pool.query('INSERT INTO business_records(id,kind,key,data) VALUES($1::uuid,$2,$1::text,$3)',[subjectId,sourceKind,subject]);
   const valid={programId,participantAlias,[sourceKey]:subjectId,milestoneDays:30,observation:'maintained',observedAt:at(31*day),recordedAt:at(31*day),reason:'Explicit isolated historical validation fixture, not deployed elapsed evidence'},fixtures=[valid,{...valid,recordedAt:at(20*day)},{...valid,programId:randomUUID()},{...valid,participantAlias:alias()},{...valid,observedAt:at(day),recordedAt:at(day)}],ids=[];
   for(const data of fixtures){const id=randomUUID();ids.push(id);await pool.query('INSERT INTO business_records(id,kind,key,data) VALUES($1::uuid,$2,$1::text,$3)',[id,kind,data]);}
   if(name==='housing')await pool.query(await readFile('modules/housing-management/migrations/006-retention-validation.sql','utf8'));
   await pool.query(await readFile('modules/'+module+'/migrations/'+migration,'utf8'));
   const validAfter=(await pool.query('SELECT * FROM business_records WHERE id=$1',[ids[0]])).rows[0];assert.equal(validAfter.revision,1);assert.deepEqual(validAfter.data,valid);
   for(let n=1;n<ids.length;n++){const kept=(await pool.query('SELECT * FROM business_records WHERE id=$1',[ids[n]])).rows[0];assert.equal(kept.data.verificationStatus,'legacy-invalid-historical-basis');for(const[k,v]of Object.entries(fixtures[n]))assert.deepEqual(kept.data[k],v);assert.equal(Number((await pool.query('SELECT count(*) n FROM '+ledger)).rows[0].n),4);}
   await assert.rejects(pool.query('DELETE FROM '+ledger),e=>e.code==='55000');assert.equal((await pool.query('SELECT count(*)::int n FROM business_records')).rows[0].n,6);
  });
 }
 await admin.query('CREATE DATABASE participant');const pool=new pg.Pool({...config,database:'participant'});pools.push(pool);await pool.query(businessSql);
 await test('Participant quarantine preserves exact original referral/receipt bytes and records an immutable freshness epoch',async()=>{
  const id=randomUUID(),provider={providerInstallationId:randomUUID(),packageDigest:'b'.repeat(64)},original={programId:randomUUID(),code:'LEGACY',provider,providerStatus:{confirmed:true,followUpMaintained:true},commandId:randomUUID(),acknowledgedAt:at(0)};await pool.query("INSERT INTO business_records(id,kind,key,data) VALUES($1::uuid,'referral',$1::text,$2)",[id,original]);const before=(await pool.query('SELECT * FROM business_records WHERE id=$1',[id])).rows[0];await pool.query(await readFile('modules/participant-services/migrations/004-retention-provenance.sql','utf8'));const after=(await pool.query('SELECT * FROM business_records WHERE id=$1',[id])).rows[0],saved=(await pool.query('SELECT original_record FROM participant_retention_quarantine WHERE referral_id=$1',[id])).rows[0];assert.deepEqual(after,before);assert.deepEqual(saved.original_record.data,original);assert.equal(saved.original_record.revision,1);await assert.rejects(pool.query('DELETE FROM participant_retention_quarantine'),e=>e.code==='55000');await assert.rejects(pool.query("UPDATE participant_retention_policy_epoch SET enabled_at='2000-01-01'"),e=>e.code==='55000');
 });
}finally{for(const pool of pools)await pool.end();await admin?.end();try{docker(['rm','-f',container]);}catch{}await rm(file,{force:true});}
