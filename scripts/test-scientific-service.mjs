// Independent service acceptance; never mounts a deployment or opens a business DB.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
import {privateDirectory} from '../tools/installer/dist/security.js';
const run=args=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe']}).trim();
execFileSync('docker',['build','-f','services/scientific/Dockerfile','--target','test','-t','steward-scientific:test','.'],{stdio:'inherit'});
execFileSync('docker',['run','--rm','--network','none','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=32m','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','768m','--cpus','2','steward-scientific:test'],{stdio:'inherit'});
execFileSync('docker',['build','-f','services/scientific/Dockerfile','--target','runtime','-t','steward-scientific:development','.'],{stdio:'inherit'});
const dir=path.resolve('.steward/scientific-tests',randomUUID());await mkdir(dir,{recursive:true});privateDirectory(dir);const key=path.join(dir,'key');await writeFile(key,randomBytes(32).toString('hex')+'\n',{mode:0o600});let container;
try{
 container=run(['run','-d','--network','none','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=32m','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','768m','--cpus','2','--mount','type=bind,source='+key+',target=/run/secrets/science-key,readonly','steward-scientific:development']);
 const metadata=JSON.parse(run(['inspect',container]))[0];assert.equal(metadata.HostConfig.NetworkMode,'none');assert.equal(metadata.Config.User,'10001:10001');assert.equal(metadata.Mounts.length,1);
 let ready=false;for(let n=0;n<40;n++){try{run(['exec',container,'python','-c',"import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/ready',timeout=1)"]);ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}assert(ready,'Actual scientific container readiness');
 const code=`import urllib.request,json,time,secrets,hmac,hashlib,uuid,pathlib
entity=str(uuid.uuid4());body=json.dumps({'schemaVersion':1,'jobId':str(uuid.uuid4()),'principalId':str(uuid.uuid4()),'entityIds':[entity],'capability':'describe-series','parameters':{'values':[1,2,3,None]},'executionMillis':6000,'provenance':{'datasetId':str(uuid.uuid4()),'synthetic':True,'basis':'synthetic-analytical-history','asOf':'2026-01-01T00:00:00Z','references':[]}}).encode()
stamp=str(int(time.time()));nonce=secrets.token_hex(16);key=pathlib.Path('/run/secrets/science-key').read_bytes().strip();signature=hmac.new(key,stamp.encode()+b'\\n'+nonce.encode()+b'\\nPOST\\n/v1/execute\\n'+body,hashlib.sha256).hexdigest()
request=urllib.request.Request('http://127.0.0.1:8080/v1/execute',data=body,headers={'Content-Type':'application/json','x-steward-timestamp':stamp,'x-steward-nonce':nonce,'x-steward-signature':signature})
r=json.load(urllib.request.urlopen(request,timeout=8));assert r['calculation']['mean']==2 and r['calculation']['missing']==1;assert r['entityIds']==[entity] and r['decisionExecuted']==False;print(json.dumps({'status':'passed','engine':r['engine'],'elapsedMillis':r['elapsedMillis'],'calculation':r['calculation'],'noDatabaseOrCommerceAccess':True}))`;
 const result=JSON.parse(execFileSync('docker',['exec','-i',container,'python','-'],{encoding:'utf8',input:code}));
 await writeFile('artifacts/phase12-service-http.json',JSON.stringify(result,null,2)+'\n');console.log('PASS actual nonroot, network-isolated HTTP service, authenticated calculation and retained method metadata.');
}finally{if(container){try{run(['rm','-f',container]);}catch{}}await unlink(key);await rmdir(dir);}
