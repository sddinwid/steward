import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {api,logins,sessions,waitFor} from './phase4-client.mjs';
import {directory,compose,docker,sql,json} from './lib.mjs';
import {hash} from '../packages/platform/dist/security/crypto.js';
await logins();
const config=path.join(directory,'analyst/config/model.json'),key=path.join(directory,'analyst/config/api-key.txt'),fixture=path.join(directory,'analyst/config/verification-concurrency-fixture.mjs');
const previous=await readFile(config),previousKey=await readFile(key),container=compose('ps','-q','master-api');
let started=false;
try{
 const wait=Number(sql('master',"SELECT coalesce(max(CASE WHEN hits>2 THEN greatest(0,extract(epoch from(reset_at-now()))*1000)::int ELSE 0 END),0) FROM security_rate_limits WHERE bucket='"+hash('analyst:'+sessions.master.account.account_id)+"'"));
 if(wait>0)await new Promise(r=>setTimeout(r,wait+100));
 await writeFile(key,randomUUID()+'\n');await writeFile(fixture,await readFile('scripts/test-model-server.mjs'));
 await writeFile(config,JSON.stringify({provider:'responses-compatible',model:'explicit-concurrency-fixture',endpoint:'https://127.0.0.1:9443/responses',apiKeyFile:'/etc/steward/analyst/api-key.txt',caFile:'/etc/steward/analyst/ca.pem',servername:'master.localhost',testModel:true,maxSteps:2,maxToolCalls:2,investigationTimeoutMs:60000}));
 docker(['exec','-d',container,'node','/etc/steward/analyst/verification-concurrency-fixture.mjs']);started=true;
 await new Promise(r=>setTimeout(r,300));
 const results=await Promise.all([0,1,2].map(async n=>{try{return{accepted:true,id:(await api('master','/api/v5/analyst/investigations','POST',{prompt:'[fixture:timeout] Concurrent request '+n},202)).value.investigationId};}catch(e){assert.ok(e.message.includes('429'));return{accepted:false};}}));
 const accepted=results.filter(r=>r.accepted);assert.equal(accepted.length,2);assert.equal(results.filter(r=>!r.accepted).length,1);
 for(const r of accepted)assert.equal((await api('master','/api/v5/analyst/investigations/'+r.id)).value.investigation.status,'running');
 const record=(await api('worker-1','/api/v3/modules/cee.operations/api/capacities','POST',{name:'Concurrency verification '+randomUUID().slice(0,8),site:'Verification only',capacity_m3:5,utilized_m3:0,monthly_operating_cost:0,currency:'EUR'},201)).value.record;
 await waitFor(async()=>(await api('master','/api/v4/analytics')).value.records.some(r=>r.record_id===record.id),'ordinary synchronization while both models are stalled');
 for(const r of accepted)assert.equal((await api('master','/api/v5/analyst/investigations/'+r.id)).value.investigation.status,'running');
 for(let n=1;n<=3;n++){assert.equal((await json('http://127.0.0.1:'+(4200+n)+'/health')).status,'ok');assert.equal((await json('http://127.0.0.1:'+(4200+n)+'/ready')).status,'ready');}
 for(const r of accepted){const end=await waitFor(async()=>{const v=(await api('master','/api/v5/analyst/investigations/'+r.id)).value.investigation;return v.status!=='running'?v:false;},'bounded stalled model request');assert.equal(end.error_code,'TRANSPORT_TIMEOUT');}
 await writeFile('artifacts/phase5-concurrency.json',JSON.stringify({verifiedAt:new Date().toISOString(),admitted:2,rejected:1,investigations:accepted.map(r=>r.id),ordinaryRecordSynchronizedDuringStalledModels:record.id,modelValidation:'Explicit HTTPS timeout fixture, not a live provider',assertions:'all passed'},null,2)+'\n');
 console.log('PASS simultaneous investigations admit exactly two and reject the third; ordinary Worker CRUD/synchronization/health continue while both models stall, then bounded timeouts persist');
}finally{
 if(started)try{docker(['exec',container,'node','-e',"const fs=require('fs');for(const p of fs.readdirSync('/proc').filter(p=>/^\\d+$/.test(p))){try{if(fs.readFileSync('/proc/'+p+'/cmdline','utf8').includes('/etc/steward/analyst/verification-concurrency-fixture.mjs')&&+p!==process.pid)process.kill(+p,'SIGTERM')}catch{}}"]);}catch{}
 await writeFile(config,previous);await writeFile(key,previousKey);await unlink(fixture).catch(()=>{});
}
