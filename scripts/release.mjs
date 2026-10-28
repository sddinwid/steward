// Portable, digest-pinned MVP distribution. Deployment state is never packaged.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream,existsSync} from 'node:fs';
import {mkdir,readFile,writeFile,copyFile,lstat,readdir,rename,rmdir,cp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {assertPlatformReleaseSource,validateReleaseVersions,assertPhase13Gates,assertPhase14Gates,assertPhase15Gates,assertPhase16Gates,assertImageBuildEvidence,releaseCandidateTag,releaseFinalTag,RELEASE15_CANDIDATE_KINDS,assertImmutableImageTag,SCIENTIFIC15_REUSE} from './release-contracts.mjs';
import {planReleaseImageImport} from './release-image-import.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {values,positionals}=parseArgs({allowPositionals:true,options:{bundle:{type:'string'},directory:{type:'string',default:'.steward/dev'},version:{type:'string',default:'0.7.0'},project:{type:'string',default:'steward-mvp'},mode:{type:'string',default:'all'},workers:{type:'string',default:'3'},trust:{type:'string'},'trust-bundled-modules':{type:'boolean',default:false},'port-offset':{type:'string'},simulators:{type:'boolean',default:false},candidate:{type:'boolean',default:false}}});
const action=positionals[0],directory=path.resolve(values.directory),bundle=path.resolve(values.bundle??'artifacts/releases/steward-'+values.version);
const run=(cmd,args,options={})=>execFileSync(cmd,args,{cwd:root,encoding:'utf8',timeout:600000,stdio:'inherit',...options});
const node=(script,args=[])=>run(process.execPath,[path.join(root,script),...args]);
const docker=(...args)=>run('docker',args,{stdio:['ignore','pipe','pipe'],maxBuffer:256*1024*1024}).trim();
async function digest(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
async function files(base){const out=[];for(const e of await readdir(base,{withFileTypes:true})){const p=path.join(base,e.name),relative=path.relative(bundle,p).replaceAll('\\','/');
 if(relative.startsWith('toolkit/')&&(/(^|\/)(node_modules|dist)(\/|$)/.test(relative)||/^toolkit\/(artifacts|\.steward)(\/|$)/.test(relative)))continue;
 if(e.isSymbolicLink())throw new Error('Release symlinks are forbidden');if(e.isDirectory())out.push(...await files(p));else if(e.isFile())out.push(p);}return out;}
async function verifyBundle(){
 const m=JSON.parse(await readFile(path.join(bundle,'release.json'),'utf8'));
 if(m.formatVersion!==1||!/^\d+\.\d+\.\d+$/.test(m.version))throw new Error('Unsupported release manifest');
 for(const [name,hash]of Object.entries(m.files)){
  const p=path.resolve(bundle,name);if(!p.startsWith(bundle+path.sep)||path.isAbsolute(name)||(await lstat(p)).isSymbolicLink())throw new Error('Unsafe release member');
  if(await digest(p)!==hash)throw new Error('Release checksum mismatch: '+name);
 }
 const actual=(await files(bundle)).map(f=>path.relative(bundle,f).replaceAll('\\','/')).filter(f=>f!=='release.json').sort();
 if(JSON.stringify(actual)!==JSON.stringify(Object.keys(m.files).sort()))throw new Error('Unexpected or missing release files');
 if(m.platformCompatibility==='0.16.0'){const member='toolkit/packages/contracts/src/index.ts';if(!m.files[member])throw Error('Shared runtime version source is missing from release');assertPlatformReleaseSource(m.version,await readFile(path.join(bundle,member),'utf8'));}
 const expected=['master-api','master-web','worker-api','worker-web','module-host','postgres',...(['0.8.0','0.9.0','0.9.1','0.11.0','0.12.0','0.13.0','0.14.0','0.15.0','0.16.0'].includes(m.platformCompatibility)?['commerce-simulator']:[]),...(['0.12.0','0.13.0','0.14.0','0.15.0','0.16.0'].includes(m.platformCompatibility)?['scientific']:[])];
 if(!['0.5.0','0.7.0','0.8.0','0.9.0','0.9.1','0.11.0','0.12.0','0.13.0','0.14.0','0.15.0','0.16.0'].includes(m.platformCompatibility)||!m.images||JSON.stringify(Object.keys(m.images).sort())!==JSON.stringify(expected.sort())||Object.values(m.images).some(i=>!/^sha256:[0-9a-f]{64}$/.test(i.id))||['images.tar','master-distribution.json','worker-distribution.json','module-packages.json','toolkit/scripts/release.mjs'].some(f=>!m.files[f]))throw new Error('Unsupported or incomplete release payload');
 if(['0.13.0','0.14.0','0.15.0','0.16.0'].includes(m.platformCompatibility)){
  if(m.version!==m.platformCompatibility||!['candidate','accepted'].includes(m.acceptanceStatus))throw Error('Release version/compatibility/status contract mismatch');
  const versions=validateReleaseVersions(JSON.parse(await readFile(path.join(bundle,'toolkit/docs/phase'+m.platformCompatibility.split('.')[1]+'-module-versions.json'),'utf8')),m.platformCompatibility),packages=JSON.parse(await readFile(path.join(bundle,'module-packages.json'),'utf8'));
  const ids=packages.map(p=>p.manifest.moduleId+'@'+p.manifest.version).sort();if(canonicalIds(ids)!==canonicalIds(Object.entries(versions.modules).map(([id,v])=>id+'@'+v))||m.images.scientific.tag!=='steward-scientific:'+versions.scientificVersion||m.images['commerce-simulator'].tag!==(['0.15.0','0.16.0'].includes(m.platformCompatibility)?releaseCandidateTag(m.version,m.sourceCommit,'commerce-simulator'):versions.commerceSimulatorTag)||!m.files['image-build.json'])throw Error('Release package/service identities differ from its central version contract');
  const imageProof=JSON.parse(await readFile(path.join(bundle,'image-build.json'),'utf8'));assertImageBuildEvidence(imageProof,m.sourceCommit,m.images,m.platformCompatibility);
  if(['0.15.0','0.16.0'].includes(m.platformCompatibility))for(const input of imageProof.scientificInputs){const member='toolkit/'+input.path;if(!m.files[member]||createHash('sha256').update((await readFile(path.join(bundle,member),'utf8')).replaceAll('\r\n','\n')).digest('hex')!==input.sha256)throw Error('Bundled Scientific runtime inputs differ from retained image provenance');}
  if(m.acceptanceStatus==='accepted'){const gates=(m.platformCompatibility==='0.16.0'?assertPhase16Gates:m.platformCompatibility==='0.15.0'?assertPhase15Gates:m.platformCompatibility==='0.14.0'?assertPhase14Gates:assertPhase13Gates)(m.acceptanceEvidence?.gates),{acceptanceEvidence,acceptanceEvidenceCommit,...candidate}=m;candidate.acceptanceStatus='candidate';const candidateHash=createHash('sha256').update(JSON.stringify(candidate,null,2)+'\n').digest('hex');if(gates.sourceCommit!==m.sourceCommit||gates.verifiedCandidateManifestSha256!==candidateHash)throw Error('Accepted evidence does not identify this exact built-source candidate');}
 }
 return m;
}
async function acceptanceGates(){const gates=JSON.parse(await readFile(path.join(root,'docs/phase8-release-gates.json'),'utf8'));if(gates.status!=='passed'||!Array.isArray(gates.gates)||JSON.stringify(gates.gates.map(g=>g.id).sort())!==JSON.stringify(['A','B','C','D','E','F'])||gates.gates.some(g=>g.status!=='passed'||!Array.isArray(g.evidence)||!g.evidence.length))throw new Error('Mandatory Phase 8 acceptance gates remain open');return gates;}
async function uiAcceptanceGates(version){const gates=JSON.parse(await readFile(path.join(root,version==='0.9.1'?'docs/v0.9.1-release-gates.json':'docs/ui-ux-release-gates.json'),'utf8'));if(gates.status!=='passed'||!Array.isArray(gates.gates)||JSON.stringify(gates.gates.map(g=>g.id).sort())!==JSON.stringify(['browser','commerce','ollama','currency','installation','regressions'].sort())||gates.gates.some(g=>g.status!=='passed'||!Array.isArray(g.evidence)||!g.evidence.length))throw new Error('Mandatory UI acceptance gates remain open');return gates;}
async function simulationAcceptanceGates(){const gates=JSON.parse(await readFile(path.join(root,'docs/phase11-release-gates.json'),'utf8'));const required=['runtime','isolation','browser','master','ollama','recovery','installation','regressions'];if(gates.status!=='passed'||!Array.isArray(gates.gates)||canonicalIds(gates.gates.map(g=>g.id))!==canonicalIds(required)||gates.gates.some(g=>g.status!=='passed'||!Array.isArray(g.evidence)||!g.evidence.length))throw new Error('Mandatory Phase 11 acceptance gates remain open');return gates;}
const canonicalIds=ids=>JSON.stringify(ids.slice().sort());
async function scientificAcceptanceGates(){const gates=JSON.parse(await readFile(path.join(root,'docs/phase12-release-gates.json'),'utf8'));const required=['scientific','forecasts','optimization','scenarios','ui','workers','mcp','ollama','isolation','recovery','installation','upgrade','regressions','release'];if(gates.status!=='passed'||!Array.isArray(gates.gates)||canonicalIds(gates.gates.map(g=>g.id))!==canonicalIds(required)||gates.gates.some(g=>g.status!=='passed'||!Array.isArray(g.evidence)||!g.evidence.length))throw new Error('Mandatory Phase 12 acceptance gates remain open');return gates;}
async function missionAcceptanceGates(){const gates=assertPhase13Gates(JSON.parse(await readFile(path.join(root,'docs/phase13-release-gates.json'),'utf8')));for(const gate of gates.gates)for(const evidence of gate.evidence){const file=path.resolve(root,evidence);if(path.isAbsolute(evidence)||!file.startsWith(root+path.sep)||!existsSync(file)||(await lstat(file)).isSymbolicLink())throw Error('Missing or unsafe Phase 13 gate evidence: '+gate.id);}return gates;}
async function economicAcceptanceGates(){const gates=assertPhase14Gates(JSON.parse(await readFile(path.join(root,'docs/phase14-release-gates.json'),'utf8')));for(const gate of gates.gates)for(const evidence of gate.evidence){const file=path.resolve(root,evidence);if(path.isAbsolute(evidence)||!file.startsWith(root+path.sep)||!existsSync(file)||(await lstat(file)).isSymbolicLink())throw Error('Missing or unsafe Phase 14 gate evidence: '+gate.id);}return gates;}
async function workflowAcceptanceGates(){const gates=assertPhase16Gates(JSON.parse(await readFile(path.join(root,'docs/phase16-release-gates.json'),'utf8')));for(const gate of gates.gates)for(const evidence of gate.evidence){const file=path.resolve(root,evidence);if(path.isAbsolute(evidence)||!file.startsWith(root+path.sep)||!existsSync(file)||(await lstat(file)).isSymbolicLink())throw Error('Missing or unsafe Phase 16 gate evidence: '+gate.id);}return gates;}
async function catalogAcceptanceGates(){const gates=assertPhase15Gates(JSON.parse(await readFile(path.join(root,'docs/phase15-release-gates.json'),'utf8')));for(const gate of gates.gates)for(const evidence of gate.evidence){const file=path.resolve(root,evidence);if(path.isAbsolute(evidence)||!file.startsWith(root+path.sep)||!existsSync(file)||(await lstat(file)).isSymbolicLink())throw Error('Missing or unsafe Phase 15 gate evidence: '+gate.id);}return gates;}
async function promote(){
 const m=await verifyBundle();if(!['0.8.0','0.9.0','0.9.1','0.11.0','0.12.0','0.13.0','0.14.0','0.15.0','0.16.0'].includes(m.version)||m.acceptanceStatus!=='candidate')throw new Error('Promotion requires a verified candidate');
 if(run('git',['status','--porcelain'],{stdio:['ignore','pipe','pipe']}).trim())throw new Error('Commit acceptance evidence before promotion');
 const gates=await (m.version==='0.16.0'?workflowAcceptanceGates():m.version==='0.15.0'?catalogAcceptanceGates():m.version==='0.14.0'?economicAcceptanceGates():m.version==='0.13.0'?missionAcceptanceGates():m.version==='0.12.0'?scientificAcceptanceGates():m.version==='0.11.0'?simulationAcceptanceGates():['0.9.0','0.9.1'].includes(m.version)?uiAcceptanceGates(m.version):acceptanceGates());if(gates.sourceCommit!==m.sourceCommit||gates.verifiedCandidateManifestSha256!==await digest(path.join(bundle,'release.json')))throw new Error('Acceptance evidence does not identify this exact candidate');
 if(['0.15.0','0.16.0'].includes(m.version)){const aliases=RELEASE15_CANDIDATE_KINDS.map(kind=>({tag:releaseFinalTag(m.version,kind),id:m.images[kind].id}));for(const image of aliases){if(JSON.parse(docker('image','inspect',image.id))[0].Id!==image.id)throw Error('Accepted candidate image is unavailable');let existing;try{existing=JSON.parse(docker('image','inspect',image.tag))[0].Id;}catch{}assertImmutableImageTag(image.tag,existing,image.id);}for(const image of aliases)docker('tag',image.id,image.tag);}
 await writeFile(path.join(bundle,'release.json'),JSON.stringify({...m,acceptanceStatus:'accepted',acceptanceEvidenceCommit:run('git',['rev-parse','HEAD'],{stdio:['ignore','pipe','pipe']}).trim(),...(['0.13.0','0.14.0','0.15.0','0.16.0'].includes(m.version)?{acceptanceEvidence:{gates}}:{})},null,2)+'\n');await verifyBundle();console.log('Promoted exact verified candidate to accepted release; payload checksums and all image IDs are unchanged.');
}
async function pack(){
 assertPlatformReleaseSource(values.version,await readFile(path.join(root,'packages/contracts/src/index.ts'),'utf8'));
 if(values.version!==JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version)throw new Error('Pack from source matching the target release version; use the preserved tagged source for historical releases.');
 if(!['0.6.0','0.7.0','0.8.0','0.9.0','0.9.1','0.11.0','0.12.0','0.13.0','0.14.0','0.15.0','0.16.0'].includes(values.version))throw new Error('Unsupported release version');
 if(['0.9.0','0.9.1','0.11.0','0.12.0','0.13.0','0.14.0','0.15.0','0.16.0'].includes(values.version)&&!values.candidate)throw new Error('Create and verify a candidate before gated release promotion');
 if(['0.8.0','0.9.0','0.9.1','0.11.0','0.12.0','0.13.0','0.14.0','0.15.0','0.16.0'].includes(values.version)){if(run('git',['status','--porcelain'],{stdio:['ignore','pipe','pipe']}).trim())throw new Error('Release packaging requires clean committed source');if(!values.candidate){await acceptanceGates();}}
 if(!/^\d+\.\d+\.\d+$/.test(values.version))throw new Error('Version must be semver');
 if(path.resolve(run('git',['rev-parse','--show-toplevel'],{stdio:['ignore','pipe','pipe']}).trim())!==root)throw new Error('Pack from the verified repository root, not an installed toolkit');
 await mkdir(path.dirname(bundle),{recursive:true});await mkdir(bundle,{recursive:false});
 const source=JSON.parse(await readFile(path.join(directory,'modules/public/catalog.json'),'utf8'));
 const trust=JSON.parse(await readFile(path.join(directory,'modules/public/trust.json'),'utf8'));
 const {verifyPackage}=await import('../packages/module-sdk/dist/index.js');
 const compatibility=['0.8.0','0.9.0','0.9.1','0.11.0','0.12.0','0.13.0','0.14.0','0.15.0','0.16.0'].includes(values.version)?values.version:values.version==='0.6.0'?'0.5.0':'0.7.0';
 const releaseVersions=['0.13.0','0.14.0','0.15.0','0.16.0'].includes(compatibility)?validateReleaseVersions(JSON.parse(await readFile(path.join(root,'docs/phase'+compatibility.split('.')[1]+'-module-versions.json'),'utf8')),compatibility):null;
 const sourceCommit=run('git',['rev-parse','HEAD'],{stdio:['ignore','pipe','pipe']}).trim();
 const selected=compatibility==='0.5.0'?['cee.inventory@1.2.1','cee.operations@1.0.0']:['cee.inventory@1.2.1','cee.inventory@1.3.2','cee.operations@1.0.0','cee.procurement@1.0.2','cee.sales@1.0.2','cee.assets@1.0.3','cee.workforce@1.0.2',...(['0.8.0','0.9.0','0.9.1','0.11.0','0.12.0'].includes(compatibility)?['cee.inventory@1.4.0','cee.sales@1.1.0','cee.shopify@1.0.0','cee.printify@1.0.0','cee.stock-ledger@1.0.0','cee.sales@1.1.1','cee.printify@1.0.1','cee.printify@1.0.2',...(['0.9.0','0.9.1'].includes(compatibility)?['cee.shopify@1.0.1','cee.printify@1.0.3','cee.printify@1.0.4']:[])]:[])];
 if(compatibility==='0.9.1'){selected.splice(0,selected.length,'cee.inventory@1.2.1','cee.inventory@1.3.2','cee.operations@1.0.0','cee.procurement@1.0.2','cee.sales@1.0.2','cee.assets@1.0.3','cee.workforce@1.0.2','cee.inventory@1.4.2','cee.sales@1.1.3','cee.shopify@1.0.1','cee.printify@1.0.6','cee.stock-ledger@1.0.0');}
 if(compatibility==='0.11.0')selected.splice(0,selected.length,'cee.inventory@1.4.2','cee.operations@1.0.0','cee.procurement@1.0.2','cee.sales@1.3.0','cee.assets@1.0.3','cee.workforce@1.0.2','cee.shopify@1.2.0','cee.printify@1.1.2','cee.stock-ledger@1.1.0','steward.simulation.commerce@1.0.2','steward.simulation.fulfillment@1.0.1');
 if(compatibility==='0.12.0')selected.splice(0,selected.length,'cee.inventory@1.4.2','cee.operations@1.0.0','cee.procurement@1.0.2','cee.sales@1.3.2','cee.assets@1.0.3','cee.workforce@1.0.2','cee.shopify@1.2.0','cee.printify@1.1.2','cee.stock-ledger@1.1.0','steward.simulation.commerce@1.1.3','steward.simulation.fulfillment@1.0.1');
 if(releaseVersions)selected.splice(0,selected.length,...Object.entries(releaseVersions.modules).map(([id,version])=>id+'@'+version));
 const packages=selected.map(id=>{
  const signed=source.packages.find(d=>d.payload.manifest.moduleId+'@'+d.payload.manifest.version===id);
  if(!signed)throw new Error('Publish required package '+id+' before packaging');return verifyPackage(signed,trust);
 });
 const images={};
 for(const kind of ['master-api','master-web','worker-api','worker-web','module-host']){
  const sourceTag=['0.15.0','0.16.0'].includes(compatibility)?releaseCandidateTag(values.version,sourceCommit,kind):'steward-'+kind+':'+compatibility,tag=['0.15.0','0.16.0'].includes(compatibility)?sourceTag:'steward-'+kind+':'+values.version;
  const metadata=JSON.parse(docker('image','inspect',sourceTag))[0],id=metadata.Id;
  if(releaseVersions&&(metadata.Config?.Labels?.['org.opencontainers.image.revision']!==sourceCommit||metadata.Config?.Labels?.['org.opencontainers.image.version']!==values.version))throw Error('Core image source/version differs from the exact clean release source: '+kind);
  let old;try{old=JSON.parse(docker('image','inspect',tag))[0].Id;}catch{}
  if(old&&old!==id)throw new Error('Immutable release tag already has different content: '+tag);
  if(['0.15.0','0.16.0'].includes(compatibility)){const final=releaseFinalTag(values.version,kind);let oldFinal;try{oldFinal=JSON.parse(docker('image','inspect',final))[0].Id;}catch{}assertImmutableImageTag(final,oldFinal,id);}else docker('tag',id,tag);images[kind]={tag,id,platform:metadata.Os+'/'+metadata.Architecture};
 }
 images.postgres={tag:releaseVersions?.postgresImage??'postgres:17.9-alpine',id:JSON.parse(docker('image','inspect',releaseVersions?.postgresImage??'postgres:17.9-alpine'))[0].Id};
 if(['0.8.0','0.9.0','0.9.1','0.11.0','0.12.0'].includes(compatibility))images['commerce-simulator']={tag:['0.11.0','0.12.0'].includes(compatibility)?'steward-commerce-simulator:1.0.1':'steward-commerce-simulator:1.0.0',id:JSON.parse(docker('image','inspect',['0.11.0','0.12.0'].includes(compatibility)?'steward-commerce-simulator:1.0.1':'steward-commerce-simulator:1.0.0'))[0].Id};
 if(releaseVersions){const tag=['0.15.0','0.16.0'].includes(compatibility)?releaseCandidateTag(values.version,sourceCommit,'commerce-simulator'):releaseVersions.commerceSimulatorTag,image=JSON.parse(docker('image','inspect',tag))[0];if(image.Config?.Labels?.['org.opencontainers.image.revision']!==sourceCommit||image.Config?.Labels?.['org.steward.service.version']!==releaseVersions.commerceSimulatorVersion)throw Error('Simulator image source/protocol differs from the release');images['commerce-simulator']={tag,id:image.Id,platform:image.Os+'/'+image.Architecture};}
 if(['0.12.0','0.13.0','0.14.0','0.15.0','0.16.0'].includes(compatibility)){const tag='steward-scientific:'+(releaseVersions?.scientificVersion??'1.0.0'),image=JSON.parse(docker('image','inspect',tag))[0];if(image.Config?.Labels?.['org.opencontainers.image.revision']!==(['0.15.0','0.16.0'].includes(compatibility)?SCIENTIFIC15_REUSE.sourceCommit:sourceCommit)||releaseVersions&&image.Config?.Labels?.['org.opencontainers.image.version']!==releaseVersions.scientificVersion||['0.15.0','0.16.0'].includes(compatibility)&&image.Id!==SCIENTIFIC15_REUSE.imageId)throw Error('Scientific image source/version does not match declared release provenance');images.scientific={tag,id:image.Id,platform:image.Os+'/'+image.Architecture};}
 if(releaseVersions){const proof=path.join(root,'artifacts/core-images-'+values.version+(['0.15.0','0.16.0'].includes(compatibility)?'-'+sourceCommit:'')+'.json');assertImageBuildEvidence(JSON.parse(await readFile(proof,'utf8')),sourceCommit,images,values.version);await copyFile(proof,path.join(bundle,'image-build.json'));}
 const names=run('git',['ls-files','--cached','--others','--exclude-standard','-z'],{stdio:['ignore','pipe','pipe']}).split('\0').filter(Boolean);
 const toolkit=path.join(bundle,'toolkit');
 for(const name of names){
  // Acceptance evidence is emitted after packaging as a sidecar; avoid a
  // self-referential manifest checksum and stale evidence in later packages.
  if(['docs/phase6-verification-evidence.json','docs/phase7-verification-evidence.json'].includes(name))continue;
  if(!/^(apps\/|packages\/|tools\/|modules\/|scripts\/|infra\/|services\/|datasets\/|docs\/|package(?:-lock)?\.json$|tsconfig.base.json$|README.md$|CHANGELOG.md$|compose\.yaml$|\.dockerignore$)/.test(name))continue;
  if(/(^|\/)(node_modules|dist)\//.test(name))continue;
  const src=path.join(root,name);if(!(await lstat(src)).isFile())throw new Error('Non-file source');
  if(/\.(pem|key|p12|pfx)$/i.test(name)||/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=]{20}/.test(await readFile(src,'utf8')))throw new Error('Secret-like source file must not enter a release: '+name);
  const dest=path.join(toolkit,name);await mkdir(path.dirname(dest),{recursive:true});await copyFile(src,dest);
 }
 await writeFile(path.join(bundle,'module-packages.json'),JSON.stringify(packages,null,2)+'\n');
 for(const role of ['master','worker'])await writeFile(path.join(bundle,role+'-distribution.json'),JSON.stringify({formatVersion:1,version:values.version,platformCompatibility:compatibility,role,images:Object.fromEntries(Object.entries(images).filter(([k])=>k.startsWith(role)||k==='postgres'||role==='master'&&k==='scientific'||role==='worker'&&k==='module-host')),modulesBundledSeparately:true},null,2)+'\n');
 console.log('Saving versioned core, PostgreSQL and separate module images…');
 docker('image','save','-o',path.join(bundle,'images.tar'),...Object.values(images).map(i=>i.tag),...packages.map(p=>p.imageId));
 const hashes={};for(const f of await files(bundle))hashes[path.relative(bundle,f).replaceAll('\\','/')]=await digest(f);
 await writeFile(path.join(bundle,'release.json'),JSON.stringify({formatVersion:1,version:values.version,createdAt:new Date().toISOString(),acceptanceStatus:values.candidate?'candidate':'accepted',sourceCommit:run('git',['rev-parse','HEAD'],{stdio:['ignore','pipe','pipe']}).trim(),includesWorkingTreeChanges:!!run('git',['status','--porcelain'],{stdio:['ignore','pipe','pipe']}).trim(),platformCompatibility:compatibility,images,files:hashes},null,2)+'\n');
 console.log('Release '+values.version+' packaged at '+bundle+'; distribute the whole directory.');
}
async function install(upgrade=false){
 const m=await verifyBundle();
 if(!values['trust-bundled-modules'])throw new Error('Review release provenance, then approve its module payloads with --trust-bundled-modules');
 const lock=directory+'.release-lock';await mkdir(path.dirname(directory),{recursive:true});await mkdir(lock);
 try{
  const previous=existsSync(path.join(directory,'manifest.json'))?JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8')):null;
  if(upgrade&&!previous)throw new Error('Upgrade requires an existing deployment');
  if(upgrade&&['0.15.0','0.16.0'].includes(m.version)){const installed=JSON.parse(await readFile(path.join(directory,'release/installed.json'),'utf8'));if(installed.images?.postgres?.id!==m.images.postgres.id)throw Error('Phase 15 upgrade must preserve the existing PostgreSQL image; no implicit database upgrade or downgrade');}
  if(previous&&!upgrade&&['0.13.0','0.14.0','0.15.0','0.16.0'].includes(m.platformCompatibility)){
   const selected=path.join(directory,'release/installed.json'),old=existsSync(selected)?JSON.parse(await readFile(selected,'utf8')):null;
   const ids=images=>JSON.stringify(Object.keys(images??{}).sort().map(k=>[k,images[k].id]));
   if(old?.version!==m.version||ids(old.images)!==ids(m.images))throw Error('Use upgrade for an existing deployment so its configuration and databases are backed up before selecting different images');
  }
  if(upgrade&&['0.13.0','0.14.0','0.15.0','0.16.0'].includes(m.platformCompatibility)){
   const backupRoot=path.resolve(directory+'.backups'),backup=path.join(backupRoot,'release-'+m.version+'-'+new Date().toISOString().replaceAll(':','-'));
   if(!backup.startsWith(backupRoot+path.sep)||(await lstat(directory)).isSymbolicLink())throw Error('Unsafe release backup path');
   const{privateDirectory}=await import('../tools/installer/dist/security.js');await mkdir(backup,{recursive:true});privateDirectory(backup);await cp(directory,path.join(backup,'configuration'),{recursive:true,errorOnExist:true,force:false});
   const oldOverlays=['compose.yaml','network/compose.yaml','security/compose.yaml','modules/compose.yaml','data/compose.yaml','analyst/compose.yaml','scientific/compose.yaml','commerce/compose.yaml','mission/compose.yaml','economy/compose.yaml','catalog/compose.yaml','automation/compose.yaml','release/compose.yaml'].filter(f=>existsSync(path.join(directory,f))).flatMap(f=>['-f',path.join(directory,f)]);
   if(['0.15.0','0.16.0'].includes(m.version)){const operator=path.join(root,'.steward/operator'),selection=path.join(operator,'selection.json');if(existsSync(selection)&&path.resolve(JSON.parse(await readFile(selection,'utf8')).directory)===directory){await cp(operator,path.join(backup,'operator-selection'),{recursive:true,errorOnExist:true,force:false});if(existsSync(path.join(root,'.env')))await copyFile(path.join(root,'.env'),path.join(backup,'workspace.env'));}}
   for(const instance of previous.instances)await writeFile(path.join(backup,instance.key+'-databases.sql'),docker('compose',...oldOverlays,'exec','-T',instance.key+'-db','pg_dumpall','-U','postgres')+'\n',{mode:0o600});
   await writeFile(path.join(backup,'backup.json'),JSON.stringify({formatVersion:1,createdAt:new Date().toISOString(),project:previous.project,installationIds:previous.instances.map(i=>i.installationId),candidateSourceCommit:m.sourceCommit},null,2)+'\n',{mode:0o600});console.log('Preserved private configuration and complete database backup before release upgrade: '+backup);
  }
  if(['0.15.0','0.16.0'].includes(m.version))for(const kind of RELEASE15_CANDIDATE_KINDS){const tag=releaseFinalTag(m.version,kind);let old;try{old=JSON.parse(docker('image','inspect',tag))[0].Id;}catch{}assertImmutableImageTag(tag,old,m.images[kind].id);}
  if(['0.15.0','0.16.0'].includes(m.version))for(const image of Object.values(m.images)){let existing;try{existing=JSON.parse(docker('image','inspect',image.tag))[0].Id;}catch{}assertImmutableImageTag(image.tag,existing,image.id);}
  const imageImport=planReleaseImageImport({images:m.images,packages:JSON.parse(await readFile(path.join(bundle,'module-packages.json'),'utf8')),inspect:reference=>{try{return JSON.parse(docker('image','inspect',reference))[0];}catch(error){if(/No such image|No such object/i.test(String(error.stderr??'')))return null;throw error;}}});
  if(imageImport.skipImport)console.log('Verified archive checksums and all '+imageImport.imageCount+' exact local images; skipped redundant archive import.');
  else docker('image','load','-i',path.join(bundle,'images.tar'));
  for(const image of Object.values(m.images))if(JSON.parse(docker('image','inspect',image.id))[0].Id!==image.id)throw new Error('Pinned core image missing from the loaded release');
  const commerceManifest=path.join(directory,'commerce/manifest.json'),simulatorMode=values.simulators||(previous&&existsSync(commerceManifest)?JSON.parse(await readFile(commerceManifest,'utf8')).simulators:false);
  node('tools/installer/dist/cli.js',['provision','--directory',directory,'--mode',previous?.mode??values.mode,'--workers',String(previous?Math.max(1,previous.instances.filter(i=>i.role==='worker').length):values.workers),'--project',previous?.project??values.project,'--label',previous?.label??'Steward MVP',...(values['port-offset']?['--port-offset',values['port-offset']]:[])]);
  for(const cli of ['security','modules','data','analyst'])node('tools/installer/dist/'+cli+'-cli.js',[directory,...(cli==='security'&&values.trust?[path.resolve(values.trust)]:[])]);
  if(['0.12.0','0.13.0','0.14.0','0.15.0','0.16.0'].includes(m.platformCompatibility)&&(previous?.mode??values.mode)!=='worker'&&(['0.13.0','0.14.0','0.15.0','0.16.0'].includes(m.platformCompatibility)||!previous||existsSync(path.join(directory,'scientific/manifest.json'))))node('tools/installer/dist/scientific-cli.js',[directory]);
  if(['0.9.0','0.9.1','0.11.0','0.12.0','0.13.0','0.14.0','0.15.0','0.16.0'].includes(m.version))process.env.STEWARD_SIMULATOR_CURRENCY??='USD';
  if(['0.8.0','0.9.0','0.9.1','0.11.0','0.12.0','0.13.0','0.14.0','0.15.0','0.16.0'].includes(m.platformCompatibility))node('scripts/provision-commerce.mjs',[directory,...(simulatorMode?['--simulators']:[])]);
  // Last routing overlay composes all existing secured module/analyst/commerce
  // endpoints and adds v13 peer/mission ingress without editing private files.
  if(['0.13.0','0.14.0','0.15.0','0.16.0'].includes(m.platformCompatibility))node('tools/installer/dist/mission-cli.js',[directory]);
  if(['0.14.0','0.15.0','0.16.0'].includes(m.platformCompatibility))node('tools/installer/dist/economy-cli.js',[directory]);
  if(['0.15.0','0.16.0'].includes(m.platformCompatibility))node('tools/installer/dist/catalog-cli.js',[directory]);
  if(m.platformCompatibility==='0.16.0')node('tools/installer/dist/workflow-cli.js',[directory]);
  const {signPackage,canonical}=await import('../packages/module-sdk/dist/index.js');
  const key=await readFile(path.join(directory,'security/module-publisher-key.pem'),'utf8');
  const catalogPath=path.join(directory,'modules/public/catalog.json'),catalog=JSON.parse(await readFile(catalogPath,'utf8'));
  let catalogChanged=false;
  for(const payload of JSON.parse(await readFile(path.join(bundle,'module-packages.json'),'utf8'))){
   if(JSON.parse(docker('image','inspect',payload.imageId))[0].Id!==payload.imageId)throw new Error('Module image missing');
   const signed=signPackage(payload,key),old=catalog.packages.find(p=>p.payload.manifest.moduleId===payload.manifest.moduleId&&p.payload.manifest.version===payload.manifest.version);
   if(old&&canonical(old)!==canonical(signed))throw new Error('Immutable package version conflict');
   if(!old){catalog.packages.push(signed);catalogChanged=true;}
  }
  if(catalogChanged)await writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n');
  const deployment=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8')),services=[];
  for(const i of deployment.instances){
   for(const kind of ['api','web'])services.push('  '+i.key+'-'+kind+':\n    image: '+m.images[i.role+'-'+kind].id+'\n    build: !reset null\n    pull_policy: never');
   services.push('  '+i.key+'-db:\n    image: '+m.images.postgres.id+'\n    pull_policy: never');
   if(i.role==='worker')services.push('  '+i.key+'-module-host:\n    image: '+m.images['module-host'].id+'\n    build: !reset null\n    pull_policy: never');
  }
  if(m.images['commerce-simulator']&&simulatorMode)for(const provider of ['shopify','printify'])services.push('  '+provider+'-simulator:\n    image: '+m.images['commerce-simulator'].id+'\n    pull_policy: never');
  if(m.images.scientific&&existsSync(path.join(directory,'scientific/manifest.json')))services.push('  scientific:\n    image: '+m.images.scientific.id+'\n    pull_policy: never');
  const releaseDir=path.join(directory,'release');await mkdir(releaseDir,{recursive:true});
  const overlay='services:\n'+services.join('\n')+'\n',candidate=path.join(releaseDir,'candidate.yaml');await writeFile(candidate,overlay);
  const overlays=['compose.yaml','network/compose.yaml','security/compose.yaml','modules/compose.yaml','data/compose.yaml','analyst/compose.yaml','scientific/compose.yaml','commerce/compose.yaml','mission/compose.yaml','economy/compose.yaml','catalog/compose.yaml','automation/compose.yaml'].filter(f=>existsSync(path.join(directory,f))).flatMap(f=>['-f',path.join(directory,f)]);
  docker('compose',...overlays,'-f',candidate,'config','--quiet');
  const selected=path.join(releaseDir,'compose.yaml');
  if(existsSync(selected)&&await readFile(selected,'utf8')!==overlay)await copyFile(selected,path.join(releaseDir,'previous-compose.yaml'));
  await rename(candidate,selected);
  await writeFile(path.join(releaseDir,'installed.json'),JSON.stringify({formatVersion:1,version:m.version,releaseManifestSha256:await digest(path.join(bundle,'release.json')),installations:deployment.instances.map(i=>i.installationId),images:m.images},null,2)+'\n');
  if(['0.14.0','0.15.0','0.16.0'].includes(m.version)){const selectionFile=path.join(root,'.steward/operator/selection.json');if(existsSync(selectionFile)){const chosen=JSON.parse(await readFile(selectionFile,'utf8'));if(path.resolve(chosen.directory)===directory){const {selectDeployment}=await import('./select-deployment.mjs');await selectDeployment(directory);}}}
  console.log('Selected digest-pinned release '+m.version+'. Configurations and volumes preserved. Run start to deploy; no enrollment performed.');
 }finally{await rmdir(lock);}
}
try{
 if(action==='promote')await promote();
 else if(action==='pack')await pack();
 else if(action==='verify'){const m=await verifyBundle();console.log('PASS all release checksums: '+m.version);}
 else if(action==='install'||action==='upgrade')await install(action==='upgrade');
 else if(['start','stop','status'].includes(action)){
  if(action==='start'){
   const installed=JSON.parse(await readFile(path.join(directory,'release/installed.json'),'utf8'));
   for(const image of Object.values(installed.images))if(JSON.parse(docker('image','inspect',image.id))[0].Id!==image.id)throw new Error('Pinned release image unavailable; reinstall release archive');
  }
  const invoke=()=>run(process.execPath,[path.join(root,'scripts/compose.mjs'),...(action==='start'?['up','--no-build','-d','--wait','--wait-timeout','180']:action==='stop'?['down']:['ps'])],{env:{...process.env,STEWARD_DEPLOYMENT:directory}});
  try{invoke();}catch(error){if(action!=='start')throw error;console.log('Initial startup did not reach readiness. Repeating the idempotent startup once to allow restarted services to recover; persistent failures still fail the release command.');invoke();}
 }else throw new Error('Usage: node scripts/release.mjs pack|verify|install|upgrade|start|stop|status --bundle PATH --directory PATH [--trust-bundled-modules] [--mode all|master|worker] [--trust PUBLIC_MASTER_BUNDLE]');
}catch(e){console.error('Release command failed: '+e.message);process.exitCode=1;}
