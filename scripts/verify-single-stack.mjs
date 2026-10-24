// Read-only ownership audit: stopped archives consume no running-container memory.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
export function unexpectedStewardContainers(containers,selected){const ids=new Set(selected.instances.map(i=>i.installationId));return containers.filter(c=>{const l=c.Config.Labels??{},project=l['com.docker.compose.project'];if(l['steward.managed-by']==='module-host-v1')return !ids.has(l['steward.installation']);return Boolean(project&&project!==selected.project&&project.startsWith('steward'));});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const selection=JSON.parse(await readFile('.steward/operator/selection.json','utf8')),manifest=JSON.parse(await readFile(path.join(selection.directory,'manifest.json'),'utf8'));
 if(selection.project!==manifest.project)throw Error('Selected project and installation manifest differ');
 const ids=execFileSync('docker',['ps','-q'],{encoding:'utf8'}).trim().split(/\s+/).filter(Boolean),containers=ids.length?JSON.parse(execFileSync('docker',['inspect',...ids],{encoding:'utf8',maxBuffer:16*1024*1024})):[];
 const unexpected=unexpectedStewardContainers(containers,manifest),owned=containers.filter(c=>c.Config.Labels?.['com.docker.compose.project']===manifest.project||manifest.instances.some(i=>c.Config.Labels?.['steward.installation']===i.installationId));
 const report={verifiedAt:new Date().toISOString(),selectedProject:manifest.project,selectedRunningContainers:owned.length,unexpectedRunningContainers:unexpected.map(c=>c.Name),status:unexpected.length||!owned.length?'failed':'passed'};await writeFile('artifacts/single-stack-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.status!=='passed')process.exitCode=1;
}
