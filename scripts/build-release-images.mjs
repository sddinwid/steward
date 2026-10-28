import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertBuildSource,scienceVersionForRelease,validateReleaseVersions,releaseCandidateTag,releaseFinalTag,assertImmutableImageTag,SCIENTIFIC15_REUSE,POSTGRES15_IMAGE_ID,SCIENTIFIC15_INPUT_ROOTS,assertScientificInputManifest} from './release-contracts.mjs';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const version=process.argv[2]??JSON.parse(await readFile('package.json','utf8')).version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Release version must be semver');
const sourceVersion=JSON.parse(await readFile('package.json','utf8')).version;
assertBuildSource(version,sourceVersion,await readFile('services/scientific/steward_science/analysis.py','utf8'));
const versions=['0.13.0','0.14.0','0.15.0'].includes(version)?validateReleaseVersions(JSON.parse(await readFile('docs/phase'+version.split('.')[1]+'-module-versions.json','utf8')),version):null;
const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim(),sourceCommit=git(['rev-parse','HEAD']);
if(['0.11.0','0.12.0','0.13.0','0.14.0','0.15.0'].includes(version)&&git(['status','--porcelain']))throw new Error('Distribution images require clean committed source');
const images={},candidateTags={};let scientificInputs;
const inspect=tag=>JSON.parse(execFileSync('docker',['image','inspect',tag],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))[0];
function existingImage(tag){try{return inspect(tag);}catch{return null;}}
async function buildCandidate(kind,args){
 const tag=releaseCandidateTag(version,sourceCommit,kind),temporary=await mkdtemp(path.join(tmpdir(),'steward-image-iid-')),iid=path.join(temporary,'image-id');
 try{execFileSync('docker',['build',...args,'--iidfile',iid,'.'],{stdio:'inherit'});const id=(await readFile(iid,'utf8')).trim();assertImmutableImageTag(tag,existingImage(tag)?.Id,id);assertImmutableImageTag(releaseFinalTag(version,kind),existingImage(releaseFinalTag(version,kind))?.Id,id);execFileSync('docker',['tag',id,tag],{stdio:'inherit'});candidateTags[kind]=tag;return id;}finally{if(path.dirname(temporary)!==path.resolve(tmpdir())||!path.basename(temporary).startsWith('steward-image-iid-'))throw Error('Unsafe image staging cleanup path');await rm(temporary,{recursive:true,force:true});}
}
if(version==='0.15.0'){
 if(inspect(versions.postgresImage).Id!==POSTGRES15_IMAGE_ID)throw Error('Preserve the selected PostgreSQL 17.9 image identity');
 // Reuse only the exact retained runtime. Neither its old tag nor its labels are rewritten.
 const names=git(['ls-tree','-r','--name-only',sourceCommit,'--',...SCIENTIFIC15_INPUT_ROOTS]).split('\n').sort();
 scientificInputs=await Promise.all(names.map(async file=>({path:file,sha256:createHash('sha256').update((await readFile(file,'utf8')).replaceAll('\r\n','\n')).digest('hex')})));assertScientificInputManifest(scientificInputs);
 execFileSync('git',['diff','--exit-code',SCIENTIFIC15_REUSE.sourceCommit,sourceCommit,'--',...SCIENTIFIC15_INPUT_ROOTS],{stdio:['ignore','pipe','pipe']});
 const science=inspect('steward-scientific:1.2.0');if(science.Id!==SCIENTIFIC15_REUSE.imageId||science.Config?.Labels?.['org.opencontainers.image.revision']!==SCIENTIFIC15_REUSE.sourceCommit||science.Config?.Labels?.['org.opencontainers.image.version']!=='1.2.0')throw Error('Retained Scientific image provenance differs');images.scientific=science.Id;
}

// Candidate tags are local build outputs. Release bundles pin the accepted image IDs.
for(const [kind,file,app]of [['master-api','api','master'],['worker-api','api','worker'],['master-web','web','master'],['worker-web','web','worker'],['module-host','module-host',null]]){
 const tag='steward-'+kind+':'+version;
 const args=['-f','infra/Dockerfile.'+file,...(app?['--build-arg','APP='+app]:[]),'--label','org.opencontainers.image.revision='+sourceCommit,'--label','org.opencontainers.image.version='+version];
 if(version==='0.15.0')images[kind]=await buildCandidate(kind,args);else{execFileSync('docker',['build',...args,'-t',tag,'.'],{stdio:'inherit'});images[kind]=inspect(tag).Id;}
}
if(['0.12.0','0.13.0','0.14.0'].includes(version)){
 const serviceVersion=scienceVersionForRelease(version),tag='steward-scientific:'+serviceVersion;
 if(serviceVersion==='1.0.0'){let old;try{old=JSON.parse(execFileSync('docker',['image','inspect',tag],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))[0];}catch{}if(old&&old.Config?.Labels?.['org.opencontainers.image.revision']!==sourceCommit)throw new Error('Preserve the historical scientific 1.0.0 image; its source revision differs');}
 execFileSync('docker',['build','-f','services/scientific/Dockerfile','--target','runtime','--label','org.opencontainers.image.revision='+sourceCommit,'--label','org.opencontainers.image.version='+serviceVersion,'--label','org.steward.platform.release='+version,'-t',tag,'.'],{stdio:'inherit'});
 images.scientific=JSON.parse(execFileSync('docker',['image','inspect',tag],{encoding:'utf8'}))[0].Id;
}
if(versions){
 // New release-scoped tag: never overwrite preserved simulator:1.0.1 images.
 const args=['-f','infra/Dockerfile.commerce-simulator','--label','org.opencontainers.image.revision='+sourceCommit,'--label','org.opencontainers.image.version='+version,'--label','org.steward.service.version='+versions.commerceSimulatorVersion];
 if(version==='0.15.0')images['commerce-simulator']=await buildCandidate('commerce-simulator',args);else{execFileSync('docker',['build',...args,'-t',versions.commerceSimulatorTag,'.'],{stdio:'inherit'});images['commerce-simulator']=inspect(versions.commerceSimulatorTag).Id;}
 // Retain the already present PostgreSQL base image. No implicit database
 // image pull, major upgrade or historical tag rewrite occurs here.
 images.postgres=JSON.parse(execFileSync('docker',['image','inspect',versions.postgresImage],{encoding:'utf8'}))[0].Id;
}
await mkdir('artifacts',{recursive:true});const proof={version,sourceCommit,images,...(version==='0.15.0'?{candidateTags,scientificReuse:SCIENTIFIC15_REUSE,scientificInputs}:{})},proofFile='artifacts/core-images-'+version+(version==='0.15.0'?'-'+sourceCommit:'')+'.json';const text=JSON.stringify(proof,null,2)+'\n';try{await writeFile(proofFile,text,{flag:version==='0.15.0'?'wx':'w'});}catch(error){if(version!=='0.15.0'||error.code!=='EEXIST'||await readFile(proofFile,'utf8')!==text)throw error;}
