import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const version=process.argv[2]??JSON.parse(await readFile('package.json','utf8')).version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Release version must be semver');
// Candidate tags are local build outputs. Release bundles pin the accepted image IDs.
for(const [kind,file,app]of [['master-api','api','master'],['worker-api','api','worker'],['master-web','web','master'],['worker-web','web','worker'],['module-host','module-host',null]]){
 execFileSync('docker',['build','-f','infra/Dockerfile.'+file,...(app?['--build-arg','APP='+app]:[]),'-t','steward-'+kind+':'+version,'.'],{stdio:'inherit'});
}
