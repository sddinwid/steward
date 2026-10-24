// Portable, digest-pinned MVP distribution. Deployment state is never packaged.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream,existsSync} from 'node:fs';
import {mkdir,readFile,writeFile,copyFile,lstat,readdir,rename,rmdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {values,positionals}=parseArgs({allowPositionals:true,options:{bundle:{type:'string'},directory:{type:'string',default:'.steward/dev'},version:{type:'string',default:'0.7.0'},project:{type:'string',default:'steward-mvp'},mode:{type:'string',default:'all'},workers:{type:'string',default:'3'},trust:{type:'string'},'trust-bundled-modules':{type:'boolean',default:false},'port-offset':{type:'string'},simulators:{type:'boolean',default:false},candidate:{type:'boolean',default:false}}});
const action=positionals[0],directory=path.resolve(values.directory),bundle=path.resolve(values.bundle??'artifacts/releases/steward-'+values.version);
const run=(cmd,args,options={})=>execFileSync(cmd,args,{cwd:root,encoding:'utf8',timeout:600000,stdio:'inherit',...options});
const node=(script,args=[])=>run(process.execPath,[path.join(root,script),...args]);
const docker=(...args)=>run('docker',args,{stdio:['ignore','pipe','pipe']}).trim();
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
 const expected=['master-api','master-web','worker-api','worker-web','module-host','postgres',...(['0.8.0','0.9.0'].includes(m.platformCompatibility)?['commerce-simulator']:[])];
 if(!['0.5.0','0.7.0','0.8.0','0.9.0'].includes(m.platformCompatibility)||!m.images||JSON.stringify(Object.keys(m.images).sort())!==JSON.stringify(expected.sort())||Object.values(m.images).some(i=>!/^sha256:[0-9a-f]{64}$/.test(i.id))||['images.tar','master-distribution.json','worker-distribution.json','module-packages.json','toolkit/scripts/release.mjs'].some(f=>!m.files[f]))throw new Error('Unsupported or incomplete release payload');
 return m;
}
async function acceptanceGates(){const gates=JSON.parse(await readFile(path.join(root,'docs/phase8-release-gates.json'),'utf8'));if(gates.status!=='passed'||!Array.isArray(gates.gates)||JSON.stringify(gates.gates.map(g=>g.id).sort())!==JSON.stringify(['A','B','C','D','E','F'])||gates.gates.some(g=>g.status!=='passed'||!Array.isArray(g.evidence)||!g.evidence.length))throw new Error('Mandatory Phase 8 acceptance gates remain open');return gates;}
async function promote(){
 const m=await verifyBundle();if(m.version!=='0.8.0'||m.acceptanceStatus!=='candidate')throw new Error('Promotion requires a verified Phase 8 candidate');
 if(run('git',['status','--porcelain'],{stdio:['ignore','pipe','pipe']}).trim())throw new Error('Commit acceptance evidence before promotion');
 const gates=await acceptanceGates();if(gates.sourceCommit!==m.sourceCommit||gates.verifiedCandidateManifestSha256!==await digest(path.join(bundle,'release.json')))throw new Error('Acceptance evidence does not identify this exact candidate');
 await writeFile(path.join(bundle,'release.json'),JSON.stringify({...m,acceptanceStatus:'accepted',acceptanceEvidenceCommit:run('git',['rev-parse','HEAD'],{stdio:['ignore','pipe','pipe']}).trim()},null,2)+'\n');await verifyBundle();console.log('Promoted exact verified candidate to accepted release; payload checksums and all image IDs are unchanged.');
}
async function pack(){
 if(values.version!==JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version)throw new Error('Pack from source matching the target release version; use the preserved tagged source for historical releases.');
 if(!['0.6.0','0.7.0','0.8.0','0.9.0'].includes(values.version))throw new Error('Unsupported release version');
 if(values.version==='0.9.0'&&!values.candidate)throw new Error('UI acceptance must be recorded before promoting a 0.9.0 candidate');
 if(['0.8.0','0.9.0'].includes(values.version)){if(run('git',['status','--porcelain'],{stdio:['ignore','pipe','pipe']}).trim())throw new Error('Phase 8 packaging requires clean committed source');if(!values.candidate){await acceptanceGates();}}
 if(!/^\d+\.\d+\.\d+$/.test(values.version))throw new Error('Version must be semver');
 if(path.resolve(run('git',['rev-parse','--show-toplevel'],{stdio:['ignore','pipe','pipe']}).trim())!==root)throw new Error('Pack from the verified repository root, not an installed toolkit');
 await mkdir(path.dirname(bundle),{recursive:true});await mkdir(bundle,{recursive:false});
 const source=JSON.parse(await readFile(path.join(directory,'modules/public/catalog.json'),'utf8'));
 const trust=JSON.parse(await readFile(path.join(directory,'modules/public/trust.json'),'utf8'));
 const {verifyPackage}=await import('../packages/module-sdk/dist/index.js');
 const compatibility=['0.8.0','0.9.0'].includes(values.version)?values.version:values.version==='0.6.0'?'0.5.0':'0.7.0';
 const selected=compatibility==='0.5.0'?['cee.inventory@1.2.1','cee.operations@1.0.0']:['cee.inventory@1.2.1','cee.inventory@1.3.2','cee.operations@1.0.0','cee.procurement@1.0.2','cee.sales@1.0.2','cee.assets@1.0.3','cee.workforce@1.0.2',...(['0.8.0','0.9.0'].includes(compatibility)?['cee.inventory@1.4.0','cee.sales@1.1.0','cee.shopify@1.0.0','cee.printify@1.0.0','cee.stock-ledger@1.0.0','cee.sales@1.1.1','cee.printify@1.0.1','cee.printify@1.0.2']:[])];
 const packages=selected.map(id=>{
  const signed=source.packages.find(d=>d.payload.manifest.moduleId+'@'+d.payload.manifest.version===id);
  if(!signed)throw new Error('Publish required package '+id+' before packaging');return verifyPackage(signed,trust);
 });
 const images={};
 for(const kind of ['master-api','master-web','worker-api','worker-web','module-host']){
  const sourceTag='steward-'+kind+':'+compatibility,tag='steward-'+kind+':'+values.version;
  const metadata=JSON.parse(docker('image','inspect',sourceTag))[0],id=metadata.Id;
  let old;try{old=JSON.parse(docker('image','inspect',tag))[0].Id;}catch{}
  if(old&&old!==id)throw new Error('Immutable release tag already has different content: '+tag);
  docker('tag',id,tag);images[kind]={tag,id,platform:metadata.Os+'/'+metadata.Architecture};
 }
 images.postgres={tag:'postgres:17.9-alpine',id:JSON.parse(docker('image','inspect','postgres:17.9-alpine'))[0].Id};
 if(['0.8.0','0.9.0'].includes(compatibility))images['commerce-simulator']={tag:'steward-commerce-simulator:1.0.0',id:JSON.parse(docker('image','inspect','steward-commerce-simulator:1.0.0'))[0].Id};
 const names=run('git',['ls-files','--cached','--others','--exclude-standard','-z'],{stdio:['ignore','pipe','pipe']}).split('\0').filter(Boolean);
 const toolkit=path.join(bundle,'toolkit');
 for(const name of names){
  // Acceptance evidence is emitted after packaging as a sidecar; avoid a
  // self-referential manifest checksum and stale evidence in later packages.
  if(['docs/phase6-verification-evidence.json','docs/phase7-verification-evidence.json'].includes(name))continue;
  if(!/^(apps\/|packages\/|tools\/|modules\/|scripts\/|infra\/|datasets\/|docs\/|package(?:-lock)?\.json$|tsconfig.base.json$|README.md$|\.dockerignore$)/.test(name))continue;
  if(/(^|\/)(node_modules|dist)\//.test(name))continue;
  const src=path.join(root,name);if(!(await lstat(src)).isFile())throw new Error('Non-file source');
  if(/\.(pem|key|p12|pfx)$/i.test(name)||/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=]{20}/.test(await readFile(src,'utf8')))throw new Error('Secret-like source file must not enter a release: '+name);
  const dest=path.join(toolkit,name);await mkdir(path.dirname(dest),{recursive:true});await copyFile(src,dest);
 }
 await writeFile(path.join(bundle,'module-packages.json'),JSON.stringify(packages,null,2)+'\n');
 for(const role of ['master','worker'])await writeFile(path.join(bundle,role+'-distribution.json'),JSON.stringify({formatVersion:1,version:values.version,platformCompatibility:compatibility,role,images:Object.fromEntries(Object.entries(images).filter(([k])=>k.startsWith(role)||k==='postgres'||role==='worker'&&k==='module-host')),modulesBundledSeparately:true},null,2)+'\n');
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
  docker('image','load','-i',path.join(bundle,'images.tar'));
  for(const image of Object.values(m.images))if(JSON.parse(docker('image','inspect',image.id))[0].Id!==image.id)throw new Error('Pinned core image missing from the loaded release');
  const previous=existsSync(path.join(directory,'manifest.json'))?JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8')):null;
  if(upgrade&&!previous)throw new Error('Upgrade requires an existing deployment');
  node('tools/installer/dist/cli.js',['provision','--directory',directory,'--mode',previous?.mode??values.mode,'--workers',String(previous?Math.max(1,previous.instances.filter(i=>i.role==='worker').length):values.workers),'--project',previous?.project??values.project,'--label',previous?.label??'Steward MVP',...(values['port-offset']?['--port-offset',values['port-offset']]:[])]);
  for(const cli of ['security','modules','data','analyst'])node('tools/installer/dist/'+cli+'-cli.js',[directory,...(cli==='security'&&values.trust?[path.resolve(values.trust)]:[])]);
  if(['0.8.0','0.9.0'].includes(m.platformCompatibility))node('scripts/provision-commerce.mjs',[directory,...(values.simulators?['--simulators']:[])]);
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
  if(m.images['commerce-simulator']&&values.simulators)for(const provider of ['shopify','printify'])services.push('  '+provider+'-simulator:\n    image: '+m.images['commerce-simulator'].id+'\n    pull_policy: never');
  const releaseDir=path.join(directory,'release');await mkdir(releaseDir,{recursive:true});
  const overlay='services:\n'+services.join('\n')+'\n',candidate=path.join(releaseDir,'candidate.yaml');await writeFile(candidate,overlay);
  const overlays=['compose.yaml','network/compose.yaml','security/compose.yaml','modules/compose.yaml','data/compose.yaml','analyst/compose.yaml','commerce/compose.yaml'].filter(f=>existsSync(path.join(directory,f))).flatMap(f=>['-f',path.join(directory,f)]);
  docker('compose',...overlays,'-f',candidate,'config','--quiet');
  const selected=path.join(releaseDir,'compose.yaml');
  if(existsSync(selected)&&await readFile(selected,'utf8')!==overlay)await copyFile(selected,path.join(releaseDir,'previous-compose.yaml'));
  await rename(candidate,selected);
  await writeFile(path.join(releaseDir,'installed.json'),JSON.stringify({formatVersion:1,version:m.version,releaseManifestSha256:await digest(path.join(bundle,'release.json')),installations:deployment.instances.map(i=>i.installationId),images:m.images},null,2)+'\n');
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
  run(process.execPath,[path.join(root,'scripts/compose.mjs'),...(action==='start'?['up','--no-build','-d','--wait','--wait-timeout','180']:action==='stop'?['down']:['ps'])],{env:{...process.env,STEWARD_DEPLOYMENT:directory}});
 }else throw new Error('Usage: node scripts/release.mjs pack|verify|install|upgrade|start|stop|status --bundle PATH --directory PATH [--trust-bundled-modules] [--mode all|master|worker] [--trust PUBLIC_MASTER_BUNDLE]');
}catch(e){console.error('Release command failed: '+e.message);process.exitCode=1;}
