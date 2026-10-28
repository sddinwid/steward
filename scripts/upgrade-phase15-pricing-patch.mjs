// Selected-stack Pricing patch only. No operational access without explicit execution readiness.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {canonical,digest,verifyPackage} from '../packages/module-sdk/dist/index.js';
import {preparePricingPatch,applyPricingPatch,assertRetainedPatchGovernance,assertCompleteClusterDump} from './phase15-pricing-patch-policy.mjs';
const {values}=parseArgs({options:{'execute-authorized':{type:'boolean',default:false},'backup-directory':{type:'string'},'upgrade-proof':{type:'string'}}});
if(!values['execute-authorized']){console.log(JSON.stringify({executed:false,target:'All three existing Pricing1.3.0 to immutable1.3.1 only',required:'--execute-authorized --backup-directory <completed post-withdrawal full backup> --upgrade-proof <passed selected-core-upgrade report>',preserves:'Original configuration, module_identity, all application rows/history/SQL, obligations and original provider pins; only explicit reviewed new-work routes change'}));process.exit(0);}
assert.equal(process.env.STEWARD_PHASE15_ROOT_READY,'1','Explicit root readiness required');assert(values['backup-directory']&&values['upgrade-proof'],'Explicit completed backup and upgrade proof required');
const root=process.cwd(),selectionBytes=await fs.readFile('.steward/operator/selection.json'),selection=JSON.parse(selectionBytes),directory=path.resolve(selection.directory),backup=path.resolve(values['backup-directory']),proofFile=path.resolve(values['upgrade-proof']);
assert(backup.startsWith(path.resolve(directory+'.backups')+path.sep),'Use the original selected deployment release backup');assert(!(await fs.lstat(backup)).isSymbolicLink());
const proofBytes=await fs.readFile(proofFile),proof=JSON.parse(proofBytes),backupMarker=JSON.parse(await fs.readFile(path.join(backup,'backup.json'),'utf8')),backupConfig=JSON.parse(await fs.readFile(path.join(backup,'configuration/manifest.json'),'utf8')),deployment=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
assert.equal(proof.status,'passed','Core preservation verification must finish first');assert.equal(proof.finalTopology,'passed');assert.equal(proof.project,selection.project);assert.equal(backupMarker.candidateSourceCommit,proof.sourceCommit);assert.equal(backupMarker.project,selection.project);assert.equal(backupMarker.formatVersion,1);assert(Date.parse(backupMarker.createdAt)>=Date.parse(proof.startedAt)&&Date.parse(backupMarker.createdAt)<=Date.parse(proof.finishedAt));
const identities=deployment.instances.map(({key,installationId})=>({key,installationId}));assert.equal(canonical(backupConfig.instances.map(({key,installationId})=>({key,installationId}))),canonical(identities));assert.equal(canonical([...backupMarker.installationIds].sort()),canonical(identities.map(i=>i.installationId).sort()));
for(const {key}of identities)await assertCompleteClusterDump(path.join(backup,key+'-databases.sql'));
const privateFiles={};async function files(base,relative=''){for(const entry of await fs.readdir(path.join(base,relative),{withFileTypes:true})){const name=path.join(relative,entry.name);assert(!entry.isSymbolicLink());if(entry.isDirectory())await files(base,name);else if(entry.isFile())privateFiles[name.replaceAll('\\','/')]=digest(await fs.readFile(path.join(base,name)));}}
for(const scope of ['security','commerce/private']){const original={...privateFiles};await files(path.join(backup,'configuration'),scope);for(const name of Object.keys(privateFiles).filter(n=>!(n in original)))assert.equal(digest(await fs.readFile(path.join(directory,name))),privateFiles[name],'Original private credential/configuration changed: '+name);}
process.argv[2]=directory;process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');
const client=await import('./phase13-acceptance-client.mjs'),ledgerFile=path.join(directory,'demo/phase15-pricing131-upgrade.json'),lock=ledgerFile+'.lock';await fs.mkdir(path.dirname(ledgerFile),{recursive:true,mode:0o700});await fs.mkdir(lock);
let plan;const report={startedAt:new Date().toISOString(),status:'unverified',project:selection.project,backupDirectory:backup,coreSourceCommit:proof.sourceCommit,workers:[],cleanupErrors:[]};
const docker=args=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:128*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
const sql=(worker,database,query)=>{const container=docker(['ps','-q','--filter','label=com.docker.compose.project='+selection.project,'--filter','label=com.docker.compose.service='+worker+'-db']);assert(container&&!container.includes('\n'));return docker(['exec','-e','PGOPTIONS=-c default_transaction_read_only=on',container,'psql','-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1','-c',query]);};
const json=(w,db,q)=>JSON.parse(sql(w,db,q)),db=id=>'m_'+digest(id).slice(0,20),ID='steward.pricing.management';
const tableExists=(w,d,t)=>sql(w,d,`SELECT to_regclass('public.${t}') IS NOT NULL`)==='t';
function hashTables(worker,database){const tables=sql(worker,database,"SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").split('\n').filter(Boolean);assert(tables.length);for(const t of tables)assert(/^[a-z0-9_]+$/.test(t));const union=tables.map(t=>`SELECT '${t}' AS name,count(*)::text AS count,md5(coalesce(string_agg(h,',' ORDER BY h),'')) AS hash FROM (SELECT md5(row_to_json(r)::text) h FROM ${t} r)s`).join(' UNION ALL ');const result=json(worker,database,`SELECT json_object_agg(name,json_build_object('count',count,'hash',hash)) FROM (${union})t`);const seqs=sql(worker,database,"SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename").split('\n').filter(Boolean);for(const s of seqs){assert(/^[a-z0-9_]+$/.test(s));result['sequence:'+s]=json(worker,database,`SELECT row_to_json(t) FROM (SELECT last_value,is_called FROM ${s})t`);}return result;}
const whole=(w,t)=>json(w,'steward',`SELECT json_build_object('count',count(*),'hash',md5(coalesce(string_agg(h,',' ORDER BY h),''))) FROM (SELECT md5(row_to_json(r)::text)h FROM ${t} r)s`);
async function snapshot(worker){
 const installed=json(worker,'steward',`SELECT coalesce(json_agg(t ORDER BY "moduleId"),'[]') FROM (SELECT module_id AS "moduleId",version,state,operation_id AS "operationId",descriptor->'payload'->>'imageId' AS "imageId",descriptor->'payload'->'manifest' AS manifest,configuration,error_code AS "errorCode" FROM module_installations)t`);
 const bindings=json(worker,'steward',"SELECT coalesce(json_agg(t ORDER BY binding_id),'[]') FROM smart_bindings t"),workflows=json(worker,'steward',"SELECT coalesce(json_agg(t ORDER BY workflow_id),'[]') FROM smart_workflows t");
 const pendingPricingJobs=Number(sql(worker,db(ID),"SELECT count(*) FROM business_records WHERE kind IN ('quote-job','catalog-job','cost-input') AND data->>'status'='pending'"));
 const pendingPricingOutbox=Number(sql(worker,db(ID),"SELECT (SELECT count(*) FROM integration_outbox WHERE status='pending')+(SELECT count(*) FROM sync_outbox WHERE acknowledged_at IS NULL)"));
 const governanceProof={installations:installed,bindings,workflows,obligations:whole(worker,'smart_obligations'),routes:whole(worker,'smart_routes'),permissions:whole(worker,'module_permissions'),accounts:whole(worker,'security_accounts'),enrollment:whole(worker,'local_enrollment')};
 const s={installationId:identities.find(i=>i.key===worker).installationId,entityId:sql(worker,'steward',"SELECT entity_id FROM local_enrollment WHERE singleton AND state='enrolled'"),installed,bindings,workflows,pendingPricingJobs,pendingPricingOutbox,appliedMigrations:json(worker,db(ID),"SELECT json_agg(t ORDER BY version) FROM (SELECT version,sha256 FROM module_migrations)t"),protectedDatabase:hashTables(worker,db(ID)),governanceProof};
 if(worker==='worker-3'){
  const sales=db('cee.sales');s.protectedSalesDatabase=hashTables(worker,sales);
  s.pendingSalesOutbox=Number(sql(worker,sales,"SELECT count(*) FROM integration_outbox WHERE status='pending'"));
  s.pendingSalesIntents=tableExists(worker,sales,'sales_confirmation_intents')?Number(sql(worker,sales,"SELECT count(*) FROM sales_confirmation_intents i JOIN business_records r ON r.id=i.draft_id WHERE r.kind='governed-order' AND r.data->>'status'='draft' AND r.data->>'intentId'=i.id::text AND r.data->>'confirmationStatus'='pending' AND (i.terms->>'expiresAt')::timestamptz>now()")):0;
  s.pendingSalesQuotes=Number(sql(worker,sales,"SELECT count(*) FROM business_records WHERE kind='governed-order' AND data->>'status'='draft' AND data->>'quoteStatus'='pending'"));
 }
 return s;
}
const persist=async value=>{const temporary=ledgerFile+'.'+randomUUID()+'.tmp';await fs.writeFile(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600});await fs.rename(temporary,ledgerFile);};
try{
 execFileSync(process.execPath,['scripts/verify-single-stack.mjs'],{cwd:root,stdio:['ignore','pipe','pipe']});await client.logins();
 const catalog=JSON.parse(await fs.readFile(path.join(directory,'modules/public/catalog.json'),'utf8')),trust=JSON.parse(await fs.readFile(path.join(directory,'modules/public/trust.json'),'utf8'));
 for(const worker of ['worker-1','worker-2','worker-3']){const manager=(await client.api(worker,'/api/v3/modules')).value,candidate=manager.available.find(p=>p.packageId===ID+'@1.3.1');assert(candidate?.trusted&&candidate?.compatible,'Publish exact new trusted compatible Pricing1.3.1 first');}
 const signed=catalog.packages.find(d=>d.payload.manifest.moduleId===ID&&d.payload.manifest.version==='1.3.1');assert(signed);const candidate=verifyPackage(signed,trust),image=JSON.parse(docker(['image','inspect',candidate.imageId]))[0];assert.equal(image.Id,candidate.imageId);assert.equal(image.Config.Labels['steward.module.id'],ID);assert.equal(image.Config.Labels['steward.module.version'],'1.3.1');
 if(existsSync(ledgerFile)){plan=JSON.parse(await fs.readFile(ledgerFile,'utf8'));assert.equal(plan.packageDigest,digest(canonical(signed)));assert.equal(plan.backupDirectory,backup);assert.equal(plan.upgradeProofDigest,digest(proofBytes));assert.equal(plan.privateFilesDigest,digest(canonical(privateFiles)));}
 else{const snapshots={};for(const worker of ['worker-1','worker-2','worker-3'])snapshots[worker]=await snapshot(worker);plan=preparePricingPatch({selection,snapshots,catalog,trust,includeW3ProcurementCosts:true,includeW3SalesPricing:true});Object.assign(plan,{backupDirectory:backup,upgradeProofDigest:digest(proofBytes),privateFilesDigest:digest(canonical(privateFiles)),selectionDigest:digest(selectionBytes),createdAt:new Date().toISOString()});await persist(plan);}
 assert.equal(plan.selectionDigest,digest(selectionBytes));
 await applyPricingPatch({reviewed:true,plan,api:async(...args)=>(await client.api(...args)).value,snapshot,persist,waitFor:client.waitFor,createFullPrivateBackup:()=>{throw Error('No automatic backup creation: provide the reviewed completed release backup');},assertRetainedGovernance:async(before,after,w)=>{
  const retainedBindingIds=w.bindings.map(b=>b.originalBindingId),closedWorkflowIds=before.workflows.filter(x=>x.consumer_id===ID&&x.state==='active'&&x.accepting_new&&x.scope_program_id==null).map(x=>x.workflow_id);
  if(w.salesRebinding){retainedBindingIds.push(w.salesRebinding.originalBindingId);closedWorkflowIds.push(w.salesRebinding.originalWorkflowId);}
  assertRetainedPatchGovernance(before,after,{pricingInstallation:{operationId:w.newOperationId,imageId:plan.descriptor.payload.imageId},retainedBindingIds,closedWorkflowIds});
 }});
 for(const w of plan.workers){await client.api(w.worker,'/ready');await client.moduleApi(w.worker,ID,'/price-lists?limit=1');report.workers.push({worker:w.worker,version:'1.3.1',oldOperationId:w.oldOperationId,newOperationId:w.newOperationId,protectedTableCount:Object.keys(w.protectedDatabase).length,dataUnchanged:true,originalProviderPinsRetained:true,newWorkReviewed:true});}
 for(const [name,hash]of Object.entries(privateFiles))assert.equal(digest(await fs.readFile(path.join(directory,name))),hash,'Original private configuration changed during patch');
 assert.equal(digest(await fs.readFile('.steward/operator/selection.json')),plan.selectionDigest);report.status='passed';console.log('PASS three exact Pricing patch upgrades, original data/history/pins retained, explicit new-work governance; create separate fresh cohorts only.');
}catch(error){report.status='failed';report.error=error.message;process.exitCode=1;console.error('Pricing patch stopped: '+error.message+'; preserve private backup and ledger, no automatic rollback or identity adoption.');}
finally{
 try{execFileSync(process.execPath,['scripts/verify-single-stack.mjs'],{cwd:root,stdio:['ignore','pipe','pipe']});report.finalTopology='passed';}catch{report.finalTopology='failed';process.exitCode=1;}
 report.finishedAt=new Date().toISOString();await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/phase15-pricing-patch-upgrade.json',JSON.stringify(report,null,2)+'\n');await fs.rmdir(lock);
}
