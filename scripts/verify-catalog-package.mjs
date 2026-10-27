// Standalone signed-image acceptance only. This is not ModuleManager installation,
// a core upgrade, full-stack acceptance, or live external-provider verification.
// Run only after committing the complete source checkpoint. Private fixture data
// is excluded from Docker context and removed even when an acceptance gate fails.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {generateKeyPairSync,randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {canonical,digest,verifyPackage,validateConfiguration} from '../packages/module-sdk/dist/index.js';
import {privateDirectory} from '../tools/installer/dist/security.js';

const root=fileURLToPath(new URL('..',import.meta.url));process.chdir(root);
const args=process.argv.slice(2);assert(args.length===0||args.length===1&&args[0]==='--self-test'||args.length===2&&args[0]==='--reuse-package','Usage: node scripts/verify-catalog-package.mjs [--reuse-package <public-evidence-directory>] | --self-test');
const reuseDirectory=args[0]==='--reuse-package'?path.resolve(args[1]):null;
const runId=randomUUID(),fixtureParent=path.resolve(root,'.steward/phase15-catalog-package'),fixture=path.join(fixtureParent,runId);
const output=path.resolve(root,'artifacts/phase15b-catalog-package',runId),evidenceFile=path.join(output,'acceptance.json');
const names={database:'steward-catalog-package-db-'+runId,module:'steward-catalog-package-module-'+runId,network:'steward-catalog-package-'+runId};
const label='steward.acceptance.run',moduleId='steward.catalog.universal';
const adminPassword=randomBytes(32).toString('hex'),databasePassword=randomBytes(32).toString('hex'),gateway=randomBytes(32).toString('base64url');
const workerInstallationId=randomUUID(),entityId=randomUUID(),moduleInstallationId=randomUUID(),actorId=randomUUID();
const evidence={schemaVersion:1,runId,startedAt:new Date().toISOString(),status:'failed',boundary:'Standalone signed module image with disposable PostgreSQL. Not ModuleManager installation, core upgrade, full-stack, or live provider acceptance.',sourceCommit:null,buildSourceCommit:null,verificationCommit:null,moduleId,gates:[],cleanup:{containersRemoved:false,networkRemoved:false,privateFixtureRemoved:false},limitations:['No installed-provider SSMA routing or substitution acceptance.','No Shopify/Printify connection or external mutation.','No Master/Worker core upgrade or in-place operator deployment.','Fixture uses a dedicated bridge and loopback-only published ports; production internal-network egress isolation is not established by this test.']};
let admin,moduleDb,before,privateKey='',failure;
const docker=(args,options={})=>execFileSync('docker',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024,...options});
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const gate=name=>{evidence.gates.push({name,status:'passed',at:new Date().toISOString()});console.log('PASS '+name);};
function cleanSource(expected){assert.equal(git(['status','--porcelain']), '', 'SOURCE_NOT_CLEAN_COMMITTED');const commit=git(['rev-parse','HEAD']);assert.match(commit,/^[a-f0-9]{40}$/);if(expected)assert.equal(commit,expected,'SOURCE_COMMIT_CHANGED');return commit;}
function inspect(name,kind='container'){return JSON.parse(docker([kind,'inspect',name]))[0];}
function ownedInspect(name,kind='container'){const item=inspect(name,kind),labels=kind==='network'?item.Labels:item.Config.Labels;assert.equal(labels?.[label],runId,'FIXTURE_RESOURCE_OWNERSHIP_MISMATCH');return item;}
function operatorSnapshot(){const ids=docker(['ps','-q']).trim().split(/\s+/).filter(Boolean);if(!ids.length)return[];return JSON.parse(docker(['inspect',...ids])).filter(c=>c.Config.Labels?.['steward.managed-by']==='module-host-v1'||c.Config.Labels?.['com.docker.compose.project']?.startsWith('steward')).map(c=>({id:c.Id,image:c.Image,startedAt:c.State.StartedAt})).sort((a,b)=>a.id.localeCompare(b.id));}
async function privateFile(file,value,mode=0o600){await mkdir(path.dirname(file),{recursive:true,mode:0o700});await writeFile(file,value,{mode});}
async function request(base,url,{method='GET',body,permissions=[],authenticated=true}={}){const response=await fetch(base+url,{method,headers:{...(authenticated?{authorization:'Bearer '+gateway}:{}),'x-steward-actor':actorId,'x-steward-permissions':JSON.stringify(permissions),...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});return{status:response.status,value:await response.json()};}
async function expect(base,url,status,options={}){const response=await request(base,url,options);assert.equal(response.status,status,options.method+' '+url+' HTTP status');return response.value;}
async function waitHealth(base){const deadline=Date.now()+60000;while(Date.now()<deadline){try{if((await request(base,'/health',{authenticated:false})).status===200)return;}catch{}await delay(300);}throw Error('MODULE_HEALTH_TIMEOUT');}
function redact(error){let message=error instanceof Error?error.message:String(error);for(const value of [adminPassword,databasePassword,gateway,privateKey].filter(Boolean))message=message.replaceAll(value,'<redacted>');return message.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,'<redacted private key>').slice(0,2000);}
function ipv4Range(cidr){const match=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(cidr);assert(match,'INVALID_IPV4_CIDR');const octets=match.slice(1,5).map(Number),prefix=Number(match[5]);assert(octets.every((v,i)=>v>=0&&v<=255&&String(v)===match[i+1])&&prefix>=0&&prefix<=32,'INVALID_IPV4_CIDR');const address=octets.reduce((n,v)=>n*256+v,0),size=2**(32-prefix),start=address-address%size;return{start,end:start+size-1,prefix,address,octets};}
function privateSubnet(cidr){const range=ipv4Range(cidr),[a,b]=range.octets;assert(range.prefix>=24&&range.prefix<=28&&range.address===range.start,'ACCEPTANCE_SUBNET_MUST_BE_ALIGNED_SLASH24_TO_SLASH28');assert(a===10||a===172&&b>=16&&b<=31||a===192&&b===168,'ACCEPTANCE_SUBNET_MUST_BE_PRIVATE_RFC1918');return range;}
function assertNoOverlap(cidr,subnets){const range=privateSubnet(cidr);for(const other of subnets){if(!other||other.includes(':'))continue;const existing=ipv4Range(other);assert(range.end<existing.start||existing.end<range.start,'ACCEPTANCE_SUBNET_COLLIDES_WITH_DOCKER_IPAM: '+other);}return range;}
function checkedSubnet(){const subnet=process.env.STEWARD_CATALOG_ACCEPTANCE_SUBNET??'10.237.255.0/28';privateSubnet(subnet);const ids=docker(['network','ls','-q']).trim().split(/\s+/).filter(Boolean),networks=ids.length?JSON.parse(docker(['network','inspect',...ids])):[];assertNoOverlap(subnet,networks.flatMap(n=>(n.IPAM?.Config??[]).map(c=>c.Subnet)));evidence.network={subnet,checkedDockerNetworks:networks.length,collisionFree:true,checkScope:'All Docker IPv4 IPAM subnets; no networks pruned'};return subnet;}

if(args[0]==='--self-test'){
 assertNoOverlap('10.237.255.0/28',['10.0.0.0/24','172.16.0.0/24','172.31.144.0/20','fd00::/64']);
 for(const subnet of ['10.237.255.0/28','10.237.255.0/24','172.20.0.0/28','192.168.50.0/28'])assert.doesNotThrow(()=>privateSubnet(subnet));
 for(const subnet of ['8.8.8.0/28','10.237.255.1/28','10.237.0.0/16','10.237.255.0/30','10.999.0.0/28','10.023.0.0/28','not-a-cidr'])assert.throws(()=>privateSubnet(subnet));
 for(const occupied of ['10.237.255.0/28','10.237.0.0/16','10.0.0.0/8','10.237.255.8/29'])assert.throws(()=>assertNoOverlap('10.237.255.0/28',[occupied]),/COLLIDES/);
 console.log('PASS catalog package private-subnet validation and Docker IPAM overlap cases (no Docker/build/publication calls)');process.exit(0);
}

await mkdir(output,{recursive:true});
try{
 evidence.verificationCommit=cleanSource();evidence.sourceCommit=evidence.verificationCommit;evidence.buildSourceCommit=evidence.verificationCommit;git(['ls-files','--error-unmatch','scripts/verify-catalog-package.mjs','modules/catalog/Dockerfile','modules/catalog/manifest.json']);
 const dockerignore=await readFile('.dockerignore','utf8');assert(dockerignore.split(/\r?\n/).includes('.steward'),'PRIVATE_FIXTURE_MUST_BE_EXCLUDED_FROM_BUILD_CONTEXT');assert(dockerignore.split(/\r?\n/).includes('artifacts'),'EVIDENCE_MUST_BE_EXCLUDED_FROM_BUILD_CONTEXT');
 before=operatorSnapshot();evidence.operatorBefore={runningContainers:before.length,digest:digest(canonical(before))};gate('clean committed source and private Docker context');
 await mkdir(fixture,{recursive:true,mode:0o700});privateDirectory(fixture);
 let descriptor,trust;
 if(reuseDirectory){
  const previous=JSON.parse(await readFile(path.join(reuseDirectory,'acceptance.json'),'utf8'));descriptor=JSON.parse(await readFile(path.join(reuseDirectory,'descriptor.json'),'utf8'));trust=JSON.parse(await readFile(path.join(reuseDirectory,'publisher-trust.json'),'utf8'));
  assert(previous.gates?.some(g=>g.name==='published signature, image digest and committed manifest verified'&&g.status==='passed'),'PREVIOUS_SIGNED_IMAGE_GATE_REQUIRED');
  const buildCommit=previous.buildSourceCommit??previous.sourceCommit;assert.match(buildCommit,/^[a-f0-9]{40}$/);git(['cat-file','-e',buildCommit+'^{commit}']);
  // A committed harness-only fix may reuse an immutable package. Any change to
  // application build inputs requires a separately versioned signed package.
  try{git(['diff','--quiet',buildCommit,evidence.verificationCommit,'--','packages','modules/catalog','apps','tools','package.json','package-lock.json','tsconfig.base.json','.dockerignore']);}catch{throw Error('REUSED_PACKAGE_APPLICATION_INPUTS_CHANGED');}
  assert.equal(previous.package?.sourceCommit,buildCommit,'PREVIOUS_PACKAGE_SOURCE_COMMIT_MISMATCH');assert.equal(previous.package?.descriptorDigest,digest(canonical(descriptor)),'PREVIOUS_DESCRIPTOR_DIGEST_MISMATCH');assert.equal(previous.package?.imageId,descriptor.payload?.imageId,'PREVIOUS_IMAGE_DIGEST_MISMATCH');
  evidence.sourceCommit=buildCommit;evidence.buildSourceCommit=buildCommit;evidence.reusedPackageFrom=path.relative(root,reuseDirectory);
 }else{
  const keys=generateKeyPairSync('ed25519');privateKey=keys.privateKey.export({type:'pkcs8',format:'pem'}).toString();const publicKey=keys.publicKey.export({type:'spki',format:'pem'}).toString();trust={publishers:[{publisherId:'local-operator',publicKey}]};await privateFile(path.join(fixture,'security/module-publisher-key.pem'),privateKey);await privateFile(path.join(fixture,'modules/public/catalog.json'),JSON.stringify({catalogVersion:1,packages:[]})+'\n');
  // Existing publisher performs the real independent Docker build and signature.
  execFileSync(process.execPath,[path.join(root,'scripts/publish-module.mjs'),path.join(root,'modules/catalog'),fixture],{cwd:root,stdio:'inherit',timeout:20*60000});
  const packages=JSON.parse(await readFile(path.join(fixture,'modules/public/catalog.json'),'utf8')).packages;assert.equal(packages.length,1);descriptor=packages[0];
 }
 cleanSource(evidence.verificationCommit);await writeFile(path.join(output,'publisher-trust.json'),JSON.stringify(trust,null,2)+'\n');
 const payload=verifyPackage(descriptor,trust),manifest=payload.manifest;
 assert.equal(manifest.moduleId,moduleId);const sourceManifest=JSON.parse(await readFile('modules/catalog/manifest.json','utf8'));assert.equal(canonical(manifest),canonical(sourceManifest),'SIGNED_MANIFEST_DIFFERS_FROM_COMMITTED_SOURCE');
 const image=JSON.parse(docker(['image','inspect',payload.imageId]))[0];assert.equal(image.Id,payload.imageId);assert.equal(image.Config.Labels?.['steward.module.id'],moduleId);assert.equal(image.Config.Labels?.['steward.module.version'],manifest.version);assert.equal(image.Config.Labels?.['steward.module.sdk'],String(manifest.sdkVersion));
 const descriptorDigest=digest(canonical(descriptor));evidence.package={version:manifest.version,imageId:image.Id,descriptorDigest,signatureVerified:true,publisherId:payload.publisherId,sourceCommit:evidence.sourceCommit};await writeFile(path.join(output,'descriptor.json'),JSON.stringify(descriptor,null,2)+'\n');gate('published signature, image digest and committed manifest verified');
 const subnet=checkedSubnet();docker(['network','create','--subnet',subnet,'--label',label+'='+runId,names.network]);const network=ownedInspect(names.network,'network');assert.equal(network.Internal,false);evidence.network.mode='Dedicated fixture bridge; published ports bound to 127.0.0.1';assert(network.IPAM.Config.some(c=>c.Subnet===subnet));
 const databaseEnv=path.join(fixture,'database.env');await privateFile(databaseEnv,'POSTGRES_PASSWORD='+adminPassword+'\n');
 docker(['run','-d','--name',names.database,'--label',label+'='+runId,'--network',names.network,'--env-file',databaseEnv,'--tmpfs','/var/lib/postgresql/data:rw,noexec,nosuid,size=268435456','-p','127.0.0.1::5432','postgres:17.10-alpine']);
 const databaseContainer=ownedInspect(names.database),databasePort=Number(databaseContainer.NetworkSettings.Ports['5432/tcp'][0].HostPort);assert(Number.isInteger(databasePort)&&databasePort>0);
 admin=new pg.Pool({host:'127.0.0.1',port:databasePort,user:'postgres',database:'postgres',password:adminPassword,max:2,connectionTimeoutMillis:1000});for(let n=0;;n++){try{await admin.query('SELECT 1');break;}catch(error){if(n>=60)throw Error('FIXTURE_DATABASE_TIMEOUT');await delay(300);}}
 // Generated role/database/password values only. No operator connection is used.
 assert.match(databasePassword,/^[a-f0-9]{64}$/);await admin.query("CREATE ROLE catalog_fixture LOGIN PASSWORD '"+databasePassword+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION");await admin.query('CREATE DATABASE catalog_fixture OWNER catalog_fixture');await admin.query('REVOKE ALL ON DATABASE catalog_fixture FROM PUBLIC');await admin.query('GRANT CONNECT ON DATABASE catalog_fixture TO catalog_fixture');
 moduleDb=new pg.Pool({host:'127.0.0.1',port:databasePort,user:'catalog_fixture',database:'catalog_fixture',password:databasePassword,max:2,connectionTimeoutMillis:3000});const role=(await moduleDb.query('SELECT current_user AS name,rolsuper,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname=current_user')).rows[0];assert.deepEqual(role,{name:'catalog_fixture',rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false});gate('dedicated loopback fixture and nonprivileged module database');
 const secrets=path.join(fixture,'module-secrets'),configuration={integrationsEnabled:false,sourceMaxAgeHours:24};validateConfiguration(manifest,configuration);await mkdir(secrets,{recursive:true,mode:0o755});
 const runtime={installationId:workerInstallationId,entityId,moduleId,version:manifest.version,providerIdentity:{workerInstallationId,entityId,moduleId,moduleInstallationId,packageDigest:descriptorDigest},databaseHost:names.database,databaseName:'catalog_fixture',databaseUser:'catalog_fixture',configuration,persistence:manifest.persistence};
 await privateFile(path.join(secrets,'runtime.json'),JSON.stringify(runtime)+'\n',0o444);await privateFile(path.join(secrets,'gateway-token'),gateway,0o444);await privateFile(path.join(secrets,'db-password'),databasePassword,0o444);
 docker(['run','-d','--name',names.module,'--label',label+'='+runId,'--network',names.network,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--pids-limit','100','--memory','268435456','--env','MODULE_RUNTIME_FILE=/run/module-secrets/runtime.json','--mount','type=bind,source='+secrets+',target=/run/module-secrets,readonly','-p','127.0.0.1::8080',payload.imageId]);
 const running=ownedInspect(names.module);assert.equal(running.Image,payload.imageId);assert.equal(running.Config.User,'1000:1000');const port=Number(running.NetworkSettings.Ports['8080/tcp'][0].HostPort),base='http://127.0.0.1:'+port;assert(Number.isInteger(port)&&port>0);await waitHealth(base);
 await expect(base,'/ready',503);const migration=await expect(base,'/internal/migrate',200,{method:'POST',body:{}});assert.equal(migration.schemaVersion,manifest.persistence.schemaVersion);await expect(base,'/ready',200);
 const migrations=(await moduleDb.query('SELECT version,sha256,applied_at FROM module_migrations ORDER BY version')).rows;assert.deepEqual(migrations.map(({version,sha256})=>({version,sha256})),manifest.persistence.migrations);const identity=(await moduleDb.query('SELECT installation_id,module_id FROM module_identity')).rows;assert.deepEqual(identity,[{installation_id:workerInstallationId,module_id:moduleId}]);
 docker(['exec',names.module,'node','--input-type=module','-e',"import fs from 'node:fs';if(fs.existsSync('/app/packages/platform')||fs.existsSync('/app/node_modules/steward-platform'))process.exit(1)"]);gate('real image health, migrations, readiness and independent runtime');
 const permissions=[...new Set(manifest.api.map(op=>op.permission))],input={recordKey:randomUUID(),code:'PACKAGE-SERVICE',name:'Synthetic packaged service',description:'Disposable signed-image acceptance fixture',type:'service',status:'draft'};
 const created=(await expect(base,'/offerings',201,{method:'POST',body:input,permissions})).record;assert.equal(created.revision,1);assert.equal(created.ownerEntityId,entityId);assert.equal(created.createdBy,actorId);
 const edited=(await expect(base,'/offerings/'+created.id,200,{method:'PUT',body:{...input,name:'Edited packaged service',revision:created.revision},permissions})).record;assert.equal(edited.revision,2);
 const view=(await expect(base,'/catalog-view?q='+created.id,200,{permissions})).records[0];assert.equal(view.name,edited.name);assert.equal(view.ownerEntityId,entityId);assert.equal(Object.hasOwn(view,'priceCents'),false);
 await expect(base,'/offerings',403);await expect(base,'/offerings',403,{method:'POST',body:{...input,recordKey:randomUUID()}});await expect(base,'/offerings',401,{authenticated:false});await expect(base,'/offerings/'+created.id,409,{method:'PUT',body:{...input,revision:1},permissions});
 const history=(await expect(base,'/history?q='+created.id,200,{permissions})).records;assert.deepEqual(history.map(r=>r.revision).sort(),[1,2]);gate('authorized packaged CRUD, immutable revisions and denied permissions');
 docker(['restart','--time','5',names.module]);await waitHealth(base);await expect(base,'/ready',200);assert.equal(ownedInspect(names.module).Image,payload.imageId);const after=(await expect(base,'/catalog-view?q='+created.id,200,{permissions})).records[0];assert.deepEqual(after,view);
 const replay=(await expect(base,'/offerings',201,{method:'POST',body:input,permissions})).record;assert.equal(replay.id,created.id);assert.equal(replay.revision,1);assert.deepEqual((await expect(base,'/catalog-view?q='+created.id,200,{permissions})).records[0],view);
 await expect(base,'/internal/migrate',200,{method:'POST',body:{}});assert.deepEqual((await moduleDb.query('SELECT version,sha256,applied_at FROM module_migrations ORDER BY version')).rows,migrations);assert.deepEqual((await expect(base,'/history?q='+created.id,200,{permissions})).records,history);
 evidence.runtime={workerInstallationId,entityId,moduleInstallationId,databaseRole:'catalog_fixture',nonprivileged:true,acceptedOfferingId:created.id,preservedOfferingDigest:digest(canonical(view)),migrationCount:migrations.length};gate('container restart, repeated migration and original creation-receipt persistence');
 cleanSource(evidence.verificationCommit);evidence.status='passed';
}catch(error){failure=error;evidence.failure={gate:evidence.gates.at(-1)?.name??'clean committed source preflight',message:redact(error)};}
finally{
 await moduleDb?.end().catch(()=>{});await admin?.end().catch(()=>{});
 const cleanupErrors=[];
 for(const name of [names.module,names.database]){try{const present=docker(['ps','-aq','--filter','name=^/'+name+'$']).trim();if(present){ownedInspect(name);docker(['rm','-f',name]);}}catch(error){cleanupErrors.push('container '+name+': '+redact(error));}}
 evidence.cleanup.containersRemoved=cleanupErrors.length===0;
 try{if(docker(['network','ls','-q','--filter','name=^'+names.network+'$']).trim()){ownedInspect(names.network,'network');docker(['network','rm',names.network]);}evidence.cleanup.networkRemoved=true;}catch(error){cleanupErrors.push('network: '+redact(error));}
 try{const resolved=path.resolve(fixture),relative=path.relative(fixtureParent,resolved);assert.equal(relative,runId);assert(!path.isAbsolute(relative)&&!relative.startsWith('..'));await rm(resolved,{recursive:true,force:true});evidence.cleanup.privateFixtureRemoved=true;}catch(error){cleanupErrors.push('private fixture: '+redact(error));}
 try{if(before){const after=operatorSnapshot();evidence.operatorAfter={runningContainers:after.length,digest:digest(canonical(after))};assert.deepEqual(after,before,'OPERATOR_CONTAINERS_CHANGED');evidence.operatorUnchanged=true;}}catch(error){cleanupErrors.push('operator preservation: '+redact(error));}
 if(cleanupErrors.length){evidence.status='failed';evidence.cleanup.errors=cleanupErrors;}
 evidence.completedAt=new Date().toISOString();await writeFile(evidenceFile,JSON.stringify(evidence,null,2)+'\n');
}
if(evidence.status!=='passed'){console.error('Catalog package acceptance failed: '+(failure?redact(failure):'cleanup or operator-preservation gate failed'));console.error('Public evidence: '+path.relative(root,evidenceFile));process.exitCode=1;}else console.log('Catalog standalone signed-package acceptance passed. Public evidence: '+path.relative(root,evidenceFile));
