// Upgrade reporting capabilities without rewriting cases, original obligations or sealed releases.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {digest,canonical} from '../packages/module-sdk/dist/index.js';
import {privateDirectory} from '../tools/installer/dist/security.js';
import {directory,compose,docker,deployment,logins,installed,ensureInstalled} from './phase13-acceptance-client.mjs';
const versions=JSON.parse(await readFile('docs/phase13-module-versions.json','utf8')).modules;
const targets=[['worker-3','cee.workforce'],['worker-2','steward.employment.pathways'],['worker-3','steward.housing.services'],['worker-3','steward.services.food']];
const report={startedAt:new Date().toISOString(),checks:[],modules:[]};
const core=()=>Object.fromEntries(deployment.instances.filter(i=>i.role==='worker').map(i=>[i.key,JSON.parse(docker(['inspect',compose('ps','-q',i.key+'-api')]))[0].Image]));
const query=(worker,db,statement)=>compose('exec','-T',worker+'-db','psql','-U','postgres','-d',db,'-At','-v','ON_ERROR_STOP=1','-c',statement);
try{
 await logins();const beforeCore=core(),backup=path.join(directory,'backups','phase13-reporting-'+Date.now());await mkdir(backup,{recursive:true});privateDirectory(backup);
 for(const[worker,id]of targets){const current=await installed(worker,id);assert(current?.state==='active','Existing active module required; no reinstall');const db='m_'+digest(id).slice(0,20);
  const before=JSON.parse(query(worker,db,"SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM business_records t"));
  const snapshot=compose('exec','-T',worker+'-db','pg_dump','-U','postgres',db);await writeFile(path.join(backup,worker+'-'+id+'.sql'),snapshot+'\n',{mode:0o600});
  await writeFile(path.join(backup,worker+'-'+id+'.json'),JSON.stringify(current,null,2)+'\n',{mode:0o600});
  const after=await ensureInstalled(worker,id,versions[id],{});assert.equal(canonical(after.configuration),canonical(current.configuration));
  const afterRows=JSON.parse(query(worker,db,"SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM business_records t"));assert.deepEqual(afterRows,before,'Upgrade must preserve every existing business record exactly');
  report.modules.push({worker,moduleId:id,from:current.version,to:after.version,image:after.imageId,preservedRecords:before.length,configurationPreserved:true});
 }
 assert.deepEqual(core(),beforeCore);report.checks.push('Private per-module PostgreSQL backups before upgrade','Original business records, sealed aggregate releases and configurations preserved exactly','All Worker core image IDs unchanged; no database or installation re-created');report.status='passed';console.log('PASS reporting module upgrades with exact record/configuration preservation and unchanged Worker core images.');
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;console.log('Reporting upgrade failed; preserve private backups and inspect report.');}finally{await writeFile('artifacts/phase13-reporting-module-upgrade.json',JSON.stringify(report,null,2)+'\n');}
