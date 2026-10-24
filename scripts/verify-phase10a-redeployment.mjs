// Development acceptance only: redeploy clean-source Phase 10A image IDs on a selected isolated fixture.
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,stat,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {directory,manifest,compose,docker,sql} from './lib.mjs';
import {canonical,digest} from '../packages/module-sdk/dist/index.js';
const deployment=await manifest(),candidate=process.env.STEWARD_PHASE10A_IMAGE_CANDIDATE??'candidate3';assert(/^candidate[0-9]+$/.test(candidate),'Select a numbered local acceptance image candidate');
assert.equal(JSON.parse(await readFile(path.join(directory,'commerce/manifest.json'),'utf8')).simulators,true);
assert(deployment.project.startsWith('steward-phase10a-'),'Use only an explicitly isolated Phase 10A fixture');
const report={startedAt:new Date().toISOString(),sourceCommit:docker(['version','--format','{{.Server.Version}}']),checks:[]};
report.sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
async function privateFiles(){const result={};async function walk(relative){for(const f of await readdir(path.join(directory,relative),{withFileTypes:true})){const name=path.join(relative,f.name);if(f.isSymbolicLink())throw Error('Unexpected symlink in private configuration');if(f.isDirectory())await walk(name);else result[name]=digest(await readFile(path.join(directory,name)));}}
 for(const name of ['security','commerce/private','analyst/config','demo'])await walk(name);
 for(const i of deployment.instances)result[i.key+'/installation.json']=digest(await readFile(path.join(directory,i.key,'installation.json')));return result;}
function snapshot(){const rows={};for(const i of deployment.instances){rows[i.key]={};for(const table of ['platform_installation','security_accounts','legal_entities','entity_authorizations','local_enrollment','enrolled_workers','worker_candidates','module_installations'])rows[i.key][table]=digest(sql(i.key,`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM ${table} t`));if(i.role==='worker')for(const id of sql(i.key,'SELECT module_id FROM module_installations ORDER BY module_id').split('\n').filter(Boolean)){const database='m_'+digest(id).slice(0,20),table=id==='cee.inventory'?'inventory_items':'business_records';rows[i.key][id]=digest(compose('exec','-T',i.key+'-db','psql','-U','postgres','-d',database,'-At','-c',`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM ${table} t`));}}return rows;}
try{
 const files=await privateFiles(),data=snapshot(),images={};const lines=['services:'];
 for(const i of deployment.instances)for(const kind of ['api','web',...(i.role==='worker'?['module-host']:[])]){const name=kind==='module-host'?'module-host':i.role+'-'+kind,id=JSON.parse(docker(['image','inspect','steward-phase10a-'+name+':'+candidate]))[0].Id;images[i.key+'-'+kind]=id;lines.push('  '+i.key+'-'+kind+':','    image: '+id,'    build: !reset null','    pull_policy: never');}
 await writeFile(path.join(directory,'release/compose.yaml'),lines.join('\n')+'\n');
 compose('up','-d','--wait','--wait-timeout','180');
 assert.deepEqual(await privateFiles(),files,'Redeployment must preserve credentials, identities and operator configuration');assert.deepEqual(snapshot(),data,'Redeployment must preserve protected and module-owned business data');
 for(const i of deployment.instances){const response=await fetch(`http://127.0.0.1:${i.apiPort}/ready`);assert.equal(response.status,200);assert.equal((await fetch(`http://127.0.0.1:${i.webPort}`)).status,200);}
 assert.equal(new Set(deployment.instances.filter(i=>i.role==='worker').map(i=>images[i.key+'-api'])).size,1);assert.equal(new Set(deployment.instances.filter(i=>i.role==='worker').map(i=>images[i.key+'-web'])).size,1);
 execFileSync(process.execPath,['tools/installer/dist/cli.js','provision','--directory',directory,'--workers','3','--project',deployment.project,'--label',deployment.label],{stdio:'pipe'});
 for(const script of ['tools/installer/dist/security-cli.js','tools/installer/dist/modules-cli.js','tools/installer/dist/data-cli.js','tools/installer/dist/analyst-cli.js','scripts/provision-commerce.mjs'])execFileSync(process.execPath,[script,directory,...(script.includes('commerce')?['--simulators']:[])],{stdio:'pipe'});
 assert.deepEqual(await privateFiles(),files);assert.deepEqual(snapshot(),data);report.checks.push('Clean-commit pinned-image redeployment preserves protected tables, module records, credentials, trust, identities and settings','All APIs/frontends ready; identical Worker API/web artifacts','Repeated base/security/module/data/analyst/simulator provisioning preserves configuration and data');report.images=images;report.privateFilesCompared=Object.keys(files).length;report.status='passed';console.log('PASS image redeployment and repeated provisioning preserve all '+Object.keys(files).length+' private configuration files and protected/module-owned records');
}catch(e){report.status='failed';report.error=e.message;throw e;}finally{report.finishedAt=new Date().toISOString();await mkdir('artifacts',{recursive:true});await writeFile('artifacts/phase10a-redeployment.json',JSON.stringify(report,null,2)+'\n');}
