import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { manifest,compose,json } from './lib.mjs';
const deployment=await manifest();const workers=deployment.instances.filter(i=>i.role==='worker');
const master=deployment.instances.filter(i=>i.role==='master').flatMap(i=>[i.key+'-web',i.key+'-api',i.key+'-db']);
const results={startedAt:new Date().toISOString(),checks:0,restartedWorker:false};
try{
 compose('stop',...master);
 for(let round=0;round<60;round++){
  await Promise.all(workers.map(async worker=>{
   const base=`http://127.0.0.1:${worker.apiPort}`;
   const [health,ready,platform]=await Promise.all([json(base+'/health'),json(base+'/ready'),json(base+'/api/v1/platform')]);
   assert.equal(health.status,'ok');assert.equal(ready.status,'ready');assert.equal(platform.installation.installationId,worker.installationId);results.checks+=3;
  }));
  if(round===20){const first=workers[0];compose('restart',first.key+'-api');compose('up','-d','--wait','--wait-timeout','120',first.key+'-api');results.restartedWorker=true;}
  await new Promise(r=>setTimeout(r,250));
 }
 results.finishedAt=new Date().toISOString();await mkdir('artifacts',{recursive:true});await writeFile('artifacts/phase4-outage-independence.json',JSON.stringify(results,null,2));
 console.log(`PASS ${results.checks} concurrent health/readiness/platform checks with all Master services stopped, including Worker restart while disconnected`);
}finally{compose('up','-d','--wait','--wait-timeout','180',...master);}
