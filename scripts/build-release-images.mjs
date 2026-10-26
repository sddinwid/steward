import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {assertBuildSource,scienceVersionForRelease,validatePhase13Versions} from './release-contracts.mjs';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const version=process.argv[2]??JSON.parse(await readFile('package.json','utf8')).version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Release version must be semver');
const sourceVersion=JSON.parse(await readFile('package.json','utf8')).version;
assertBuildSource(version,sourceVersion,await readFile('services/scientific/steward_science/analysis.py','utf8'));
const versions=version==='0.13.0'?validatePhase13Versions(JSON.parse(await readFile('docs/phase13-module-versions.json','utf8'))):null;
const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim(),sourceCommit=git(['rev-parse','HEAD']);
if(['0.11.0','0.12.0','0.13.0'].includes(version)&&git(['status','--porcelain']))throw new Error('Distribution images require clean committed source');
const images={};
// Candidate tags are local build outputs. Release bundles pin the accepted image IDs.
for(const [kind,file,app]of [['master-api','api','master'],['worker-api','api','worker'],['master-web','web','master'],['worker-web','web','worker'],['module-host','module-host',null]]){
 const tag='steward-'+kind+':'+version;
 execFileSync('docker',['build','-f','infra/Dockerfile.'+file,...(app?['--build-arg','APP='+app]:[]),'--label','org.opencontainers.image.revision='+sourceCommit,'--label','org.opencontainers.image.version='+version,'-t',tag,'.'],{stdio:'inherit'});
 images[kind]=JSON.parse(execFileSync('docker',['image','inspect',tag],{encoding:'utf8'}))[0].Id;
}
if(['0.12.0','0.13.0'].includes(version)){
 const serviceVersion=scienceVersionForRelease(version),tag='steward-scientific:'+serviceVersion;
 if(serviceVersion==='1.0.0'){let old;try{old=JSON.parse(execFileSync('docker',['image','inspect',tag],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))[0];}catch{}if(old&&old.Config?.Labels?.['org.opencontainers.image.revision']!==sourceCommit)throw new Error('Preserve the historical scientific 1.0.0 image; its source revision differs');}
 execFileSync('docker',['build','-f','services/scientific/Dockerfile','--target','runtime','--label','org.opencontainers.image.revision='+sourceCommit,'--label','org.opencontainers.image.version='+serviceVersion,'--label','org.steward.platform.release='+version,'-t',tag,'.'],{stdio:'inherit'});
 images.scientific=JSON.parse(execFileSync('docker',['image','inspect',tag],{encoding:'utf8'}))[0].Id;
}
if(versions){
 // New release-scoped tag: never overwrite preserved simulator:1.0.1 images.
 execFileSync('docker',['build','-f','infra/Dockerfile.commerce-simulator','--label','org.opencontainers.image.revision='+sourceCommit,'--label','org.opencontainers.image.version='+version,'--label','org.steward.service.version='+versions.commerceSimulatorVersion,'-t',versions.commerceSimulatorTag,'.'],{stdio:'inherit'});
 images['commerce-simulator']=JSON.parse(execFileSync('docker',['image','inspect',versions.commerceSimulatorTag],{encoding:'utf8'}))[0].Id;
 // Retain the already present PostgreSQL base image. No implicit database
 // image pull, major upgrade or historical tag rewrite occurs here.
 images.postgres=JSON.parse(execFileSync('docker',['image','inspect',versions.postgresImage],{encoding:'utf8'}))[0].Id;
}
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/core-images-'+version+'.json',JSON.stringify({version,sourceCommit,images},null,2)+'\n');
