// Synthetic installed-module acceptance on the selected stack. This does not
// create real clients or submit any commercial provider transaction.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {api,logins,credentials,deployment,origin,sessions,waitFor} from './phase4-client.mjs';
import {directory,docker,compose,sql} from './lib.mjs';
import {canonical,digest,verifyPackage} from '../packages/module-sdk/dist/index.js';
const housing='steward.housing.management',assets='cee.assets',source='worker-1',destination='worker-2';
const stateFile=path.join(directory,'demo/phase13.json');await mkdir(path.dirname(stateFile),{recursive:true});
const state=existsSync(stateFile)?JSON.parse(await readFile(stateFile,'utf8')):{version:1,assetProgramId:randomUUID(),bindingId:randomUUID(),workflowId:randomUUID(),grantId:randomUUID()};
async function persist(){await writeFile(stateFile,JSON.stringify(state,null,2)+'\n',{mode:0o600});}await persist();
const report={verifiedAt:new Date().toISOString(),checks:[],scope:'Synthetic deployed Housing and Assets authority; no commercial calls',source,destination};
function pass(text){report.checks.push(text);console.log('PASS '+text);}
const moduleApi=async(worker,id,url,method='GET',body,status=200)=>(await api(worker,'/api/v3/modules/'+id+'/api'+url,method,body,status)).value;
const all=async(worker,id,path)=>(await moduleApi(worker,id,path)).records;
async function installed(worker,id){return(await api(worker,'/api/v3/modules')).value.installed.find(m=>m.moduleId===id);}
async function create(worker,id,url,key,body){let r=(await all(worker,id,url)).find(r=>r.code===key||r.number===key);if(!r)r=(await moduleApi(worker,id,url,'POST',body,201)).record;return r;}
async function action(worker,id,url,r){return moduleApi(worker,id,url+'/'+r.id,'POST',{revision:r.revision,requestId:randomUUID()});}
let browser;
try{
 await logins();
 const worker=w=>deployment.instances.find(i=>i.key===w),entity=w=>sql(w,"SELECT entity_id FROM local_enrollment WHERE singleton AND state='enrolled'");
 const sourceEntity=entity(source),destinationEntity=entity(destination);
 const core=()=>Object.fromEntries(deployment.instances.filter(i=>i.role==='worker').map(i=>[i.key,JSON.parse(docker(['inspect',compose('ps','-q',i.key+'-api')]))[0].Image]));
 report.coreBefore=core();
 const catalog=JSON.parse(await readFile(path.join(directory,'modules/public/catalog.json'),'utf8')),trust=JSON.parse(await readFile(path.join(directory,'modules/public/trust.json'),'utf8'));
 for(const id of [assets,housing]){const p=catalog.packages.find(p=>p.payload.manifest.moduleId===id&&p.payload.manifest.version===(id===assets?'1.1.0':'1.0.0'));assert(p);verifyPackage(p,trust);}
 let assetModule=await installed(destination,assets);
 if(!assetModule){await api(destination,'/api/v3/modules/install','POST',{packageId:assets+'@1.1.0',operationId:randomUUID(),configuration:{currency:'USD',integrationsEnabled:true,authorizedOwnerEntityIds:[destinationEntity],syntheticServiceAuthority:true,serviceAuthorityProgramId:state.assetProgramId,authorizedManagerEntityIds:[sourceEntity]}});assetModule=await installed(destination,assets);}
 assert.equal(assetModule.version,'1.1.0');if(assetModule.state!=='active')await api(destination,'/api/v3/modules/'+assets+'/lifecycle','POST',{action:'activate'});
 browser=await chromium.launch({headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('dialog',d=>d.accept());
 await page.goto(origin(source)+'/#/administration/modules');await page.getByLabel('Username',{exact:true}).fill(credentials.accounts[source].username);await page.getByLabel('Password',{exact:true}).fill(credentials.accounts[source].password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Module Manager',exact:true}).last().waitFor();
 let housingModule=await installed(source,housing);
 if(!housingModule){assert(!(await api(source,'/api/v3/modules/discovery')).value.modules.some(m=>m.moduleId===housing));
  const card=page.getByTestId('package-'+housing+'@1.0.0');await card.getByLabel('Integrations Enabled',{exact:true}).check();
  await card.getByRole('button',{name:'Install Housing Management',exact:true}).click();await page.getByTestId('installed-'+housing).waitFor({timeout:65000});
  housingModule=await installed(source,housing);pass('Housing was absent and installed through the running browser Module Manager');
 }
 assert.equal(housingModule.version,'1.0.0');if(housingModule.state!=='active'){await page.getByTestId('installed-'+housing).getByRole('button',{name:'Activate Housing Management',exact:true}).click();await waitFor(async()=> (await installed(source,housing)).state==='active','Housing activation');}
 const programme=await create(source,housing,'/programs','P13-HOUSING',{reference:randomUUID(),code:'P13-HOUSING',name:'Synthetic Phase 13 Housing',currency:'USD',assetAuthorityProgramId:state.assetProgramId,assetAuthorityEntityId:destinationEntity,assetAuthorityInstallationId:worker(destination).installationId,assetAuthorityModuleId:assets});state.housingProgramId=programme.id;await persist();
 const ownership={ownerEntityId:destinationEntity,custodianEntityId:destinationEntity,userEntityId:destinationEntity,accessBasis:'owned'};
 await create(destination,assets,'/facilities','P13-RESIDENCE',{code:'P13-RESIDENCE',name:'Synthetic mission property',site:'Synthetic demonstration site',classification:'residential',...ownership});
 const asset=await create(destination,assets,'/assets','P13-RESIDENCE',{code:'P13-RESIDENCE',name:'Synthetic twelve-unit residence',facilityCode:'P13-RESIDENCE',site:'Synthetic demonstration site',classification:'residential',...ownership,capacityM3:1200,utilizedM3:0,availability:'available',monthlyOperatingCostCents:600000,currency:'USD'});state.assetId=asset.id;await persist();
 let authority=await create(destination,assets,'/management-authorities','P13-HOUSING-AUTHORITY',{number:'P13-HOUSING-AUTHORITY',assetId:asset.id,managedEntityId:sourceEntity,managedProgramId:programme.id,startsAt:new Date(Date.now()-90*86400000).toISOString(),endsAt:new Date(Date.now()+180*86400000).toISOString(),accessBasis:'shared',authorityReference:'Synthetic approved property sharing agreement'});
 if(authority.status==='draft')authority=(await action(destination,assets,'/approve-management',authority)).record;assert.equal(authority.status,'approved');
 // Expected identities and pins come from the operator's already trusted local
 // installation files/database, independently of the offered peer profile.
 const ca=await readFile(path.join(directory,'security/ca-cert.pem'),'utf8');
 for(const [local,remote]of [[source,destination],[destination,source]]){
  const profile=(await api(remote,'/api/v13/peer-services/profile')).value.profile;
  await api(local,'/api/v13/peer-services/peers','POST',{profile,pins:{installationId:worker(remote).installationId,entityId:entity(remote),origin:origin(remote),tlsCaPem:ca,publisherTrust:trust,transport:'docker-host-localhost'}});
 }
 assetModule=await installed(destination,assets);housingModule=await installed(source,housing);
 const packageFor=(id,version)=>catalog.packages.find(p=>p.payload.manifest.moduleId===id&&p.payload.manifest.version===version);
 const existing=(await api(source,'/api/v13/peer-services')).value.grants.find(g=>g.grant_id===state.grantId);
 if(!existing){const payload={version:1,kind:'ssma-peer-grant',grantId:state.grantId,sourceInstallationId:worker(source).installationId,sourceEntityId:sourceEntity,sourceProgramId:programme.id,consumerModuleId:housing,consumerInstallationId:housingModule.operationId,consumerPackageDigest:digest(canonical(packageFor(housing,'1.0.0'))),destinationInstallationId:worker(destination).installationId,destinationEntityId:destinationEntity,destinationProgramId:state.assetProgramId,providerModuleId:assets,providerInstallationId:assetModule.operationId,providerPackageDigest:digest(canonical(packageFor(assets,'1.1.0'))),capabilityId:'property.authority',operations:['catalog','verify'],purpose:'property.authority',maximumSensitivity:'business',disclosureBasis:'documented-authority',authorityReference:authority.id,notBefore:Date.now()-1000,expiresAt:Date.now()+7*86400000};
  const proposal=(await api(source,'/api/v13/peer-services/grants/propose','POST',payload)).value,signed=(await api(destination,'/api/v13/peer-services/grants/countersign','POST',proposal)).value;await api(source,'/api/v13/peer-services/grants/approve','POST',signed);
 }
 const reason='Synthetic Phase 13 operator-reviewed property authority, programme scopes and immutable provider identity';
 await api(source,'/api/v8/smart-modules/bindings','POST',{bindingId:state.bindingId,consumerId:housing,capabilityId:'property.authority',providerId:assets,packageDigest:digest(canonical(packageFor(assets,'1.1.0'))),reason,peerGrantId:state.grantId,preserveExistingObligations:true});
 await api(source,'/api/v8/smart-modules/workflows','POST',{workflowId:state.workflowId,name:'P13 Housing property authority',version:1,consumerId:housing,steps:[{bindingId:state.bindingId,operation:'catalog'},{bindingId:state.bindingId,operation:'verify'}],reason});
 let workflow=(await api(source,'/api/v8/smart-modules')).value.workflows.find(w=>w.workflow_id===state.workflowId);
 if(workflow.state==='proposed')await api(source,'/api/v8/smart-modules/workflows/'+state.workflowId+'/lifecycle','POST',{action:'approve',reason});
 if(workflow.state!=='active')await api(source,'/api/v8/smart-modules/workflows/'+state.workflowId+'/lifecycle','POST',{action:'activate',reason});
 await action(source,housing,'/refresh-property-catalog',(await all(source,housing,'/programs')).find(r=>r.id===programme.id));
 await waitFor(async()=> (await all(source,housing,'/property-options')).some(r=>r.assetId===asset.id),'real governed remote property catalog',90000);
 let property=await create(source,housing,'/properties','P13-PROPERTY',{programId:programme.id,code:'P13-PROPERTY',assetId:asset.id});state.propertyId=property.id;await persist();
 await action(source,housing,'/verify-property',property);
 property=await waitFor(async()=>{const r=(await all(source,housing,'/properties')).find(r=>r.id===property.id);return r.authorityStatus==='verified'&&Date.parse(r.authority.validUntil)>Date.now()?r:null;},'real governed remote property verification',90000);
 assert.equal(property.authority.ownerEntityId,destinationEntity);assert.equal(property.authority.managerEntityId,sourceEntity);assert.notEqual(sourceEntity,destinationEntity);assert.equal(property.provider.providerInstallationId,assetModule.operationId);
 pass('Bilateral programme approvals and existing SSMA workflow delivered actual remote Assets catalog and verification to Housing');
 const building=await create(source,housing,'/buildings','P13-BUILDING',{programId:programme.id,code:'P13-BUILDING',name:'Synthetic twelve-unit building',propertyId:property.id});state.buildingId=building.id;await persist();
 // Normal declarative UI, authorized relationship selects, no business JSON.
 await page.goto(origin(source)+'/#/business/module/'+housing+'/units');const view=page.getByTestId('module-screen-'+housing);await view.getByRole('heading',{name:/^Housing units$/i}).waitFor();
 if(!(await all(source,housing,'/units')).some(r=>r.code==='P13-UNIT-1')){
  await view.getByLabel('Programme',{exact:true}).selectOption(programme.id);await view.getByLabel('Reference',{exact:true}).fill('P13-UNIT-1');await view.getByLabel('Building',{exact:true}).selectOption(building.id);await view.getByLabel('Unit classification',{exact:true}).selectOption('standard');await view.getByLabel('Operational availability',{exact:true}).selectOption('available');await view.getByRole('button',{name:'Create record',exact:true}).click();
  await waitFor(async()=> (await all(source,housing,'/units')).some(r=>r.code==='P13-UNIT-1'),'browser-created unit');pass('A Housing unit was created through generic module-provided forms and authorized relationship choices');
 }
 const unit=(await all(source,housing,'/units')).find(r=>r.code==='P13-UNIT-1');state.unitId=unit.id;await persist();
 await view.getByRole('cell',{name:'P13-UNIT-1',exact:true}).waitFor();
 await page.screenshot({path:'artifacts/phase13-housing-unit-browser.png',fullPage:true});
 assert(!(await api(destination,'/api/v3/modules/discovery')).value.modules.some(m=>m.moduleId===housing));assert.deepEqual(core(),report.coreBefore);pass('Housing installation left other Worker configuration and all Worker core image identities unchanged');
 report.status='passed';report.housingProgrammeId=programme.id;report.propertyAuthority={ownerEntityId:destinationEntity,managerEntityId:sourceEntity,assetId:asset.id,providerInstallationId:assetModule.operationId};
}catch(e){report.status='failed';report.error=e.message;throw e;}finally{await browser?.close();await mkdir('artifacts',{recursive:true});await writeFile('artifacts/phase13-housing-deployment.json',JSON.stringify(report,null,2)+'\n');}
