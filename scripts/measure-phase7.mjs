// Scoped acceptance observations, not a throughput or production capacity benchmark.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {directory,manifest,compose,docker,json} from './lib.mjs';
const deployment=await manifest(),ids=new Set(compose('ps','-q').split(/\s+/).filter(Boolean));
for(const worker of deployment.instances.filter(i=>i.role==='worker'))for(const id of docker(['ps','-q','--filter','label=steward.managed-by=module-host-v1','--filter','label=steward.installation='+worker.installationId]).split(/\s+/).filter(Boolean))ids.add(id);
const report={observedAt:new Date().toISOString(),project:deployment.project,kind:'single runtime snapshot and sequential localhost health observations; not a capacity benchmark',containerCount:ids.size,containers:[],health:{},databases:{}};
const statistics=docker(['stats','--no-stream','--format','{{json .}}',...ids]).split('\n').filter(Boolean).map(s=>JSON.parse(s));
function mib(text){const [,value,unit]=text.trim().match(/^([\d.]+)([a-zA-Z]+)$/)??[];const factors={B:1/1048576,kB:1000/1048576,KiB:1/1024,MB:1000000/1048576,MiB:1,GB:1000000000/1048576,GiB:1024};assert(unit in factors,'Unknown Docker memory unit');return Number(value)*factors[unit];}
for(const row of statistics){const inspected=JSON.parse(docker(['inspect',row.ID]))[0];report.containers.push({name:row.Name,imageId:inspected.Image,moduleId:inspected.Config.Labels?.['steward.module']??null,cpuPercent:Number(row.CPUPerc.replace('%','')),memoryMiB:mib(row.MemUsage.split('/')[0]),pids:Number(row.PIDs)});}
report.totalMemoryMiB=Number(report.containers.reduce((n,c)=>n+c.memoryMiB,0).toFixed(2));report.totalCpuPercent=Number(report.containers.reduce((n,c)=>n+c.cpuPercent,0).toFixed(2));
for(const instance of deployment.instances){
 const samples=[];for(let i=0;i<10;i++){const start=performance.now();assert.equal((await json('http://127.0.0.1:'+instance.apiPort+'/health')).status,'ok');samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);report.health[instance.key]={samples:10,medianMs:Number(((samples[4]+samples[5])/2).toFixed(2)),maxMs:Number(samples[9].toFixed(2))};
 report.databases[instance.key]=compose('exec','-T',instance.key+'-db','psql','-U','postgres','-At','-c',"SELECT datname FROM pg_database WHERE datname='steward' OR datname LIKE 'm_%' ORDER BY datname").split('\n').filter(Boolean);
 if(instance.role==='worker'){
  const absent=JSON.parse(compose('exec','-T',instance.key+'-api','node','-e',"const fs=require('fs');console.log(JSON.stringify(['packages/business-kit','modules/procurement','modules/sales','modules/assets','modules/workforce'].every(p=>!fs.existsSync(p))))"));assert.equal(absent,true);
 }
}
report.operationalBusinessCodeAbsentFromWorkerImages=true;
try{const response=await fetch('http://127.0.0.1:11434/api/ps',{signal:AbortSignal.timeout(4000)});report.loadedOllamaModels=(await response.json()).models.map(m=>m.name);}catch{report.loadedOllamaModels=null;}
report.status='passed';await writeFile('artifacts/phase7-resources.json',JSON.stringify(report,null,2)+'\n');console.log('PASS scoped resource/latency observations: '+ids.size+' containers, '+report.totalMemoryMiB+' MiB, '+report.totalCpuPercent+'% CPU; operational business code absent from Worker images');
