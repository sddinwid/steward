import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const version=process.argv[2]??JSON.parse(await readFile('package.json','utf8')).version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Release version must be semver');
const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim(),sourceCommit=git(['rev-parse','HEAD']);
if(['0.11.0','0.12.0','0.13.0'].includes(version)&&git(['status','--porcelain']))throw new Error('Distribution images require clean committed source');
const images={};
// Candidate tags are local build outputs. Release bundles pin the accepted image IDs.
for(const [kind,file,app]of [['master-api','api','master'],['worker-api','api','worker'],['master-web','web','master'],['worker-web','web','worker'],['module-host','module-host',null]]){
 const tag='steward-'+kind+':'+version;
 execFileSync('docker',['build','-f','infra/Dockerfile.'+file,...(app?['--build-arg','APP='+app]:[]),'--label','org.opencontainers.image.revision='+sourceCommit,'--label','org.opencontainers.image.version='+version,'-t',tag,'.'],{stdio:'inherit'});
 images[kind]=JSON.parse(execFileSync('docker',['image','inspect',tag],{encoding:'utf8'}))[0].Id;
}
if(version==='0.12.0'){
 const tag='steward-scientific:1.0.0';
 execFileSync('docker',['build','-f','services/scientific/Dockerfile','--target','runtime','--label','org.opencontainers.image.revision='+sourceCommit,'--label','org.opencontainers.image.version=1.0.0','--label','org.steward.platform.release='+version,'-t',tag,'.'],{stdio:'inherit'});
 images.scientific=JSON.parse(execFileSync('docker',['image','inspect',tag],{encoding:'utf8'}))[0].Id;
}
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/core-images-'+version+'.json',JSON.stringify({version,sourceCommit,images},null,2)+'\n');
