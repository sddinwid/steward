// Explicitly installs only the synthetic carrier into the selected Worker 3.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';
const selection=JSON.parse(await readFile('.steward/operator/selection.json','utf8'));
process.argv[2]=selection.directory;
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(selection.directory,'demo/presenter.json');
const {api,login,credentials,origin,sessions,waitFor}=await import('./phase4-client.mjs');
const {docker}=await import('./lib.mjs');
const {mcp}=await import('./mcp-client.mjs');
const dir=path.join(selection.directory,'demo/carrier-acceptance');await mkdir(dir,{recursive:true});
const stateFile=path.join(dir,'state.json');let state;try{state=JSON.parse(await readFile(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={operationId:randomUUID(),bindingId:randomUUID(),workflowId:randomUUID(),reference:'acceptance-'+randomUUID().slice(0,8)};}
await writeFile(stateFile,JSON.stringify(state,null,2));
const report={at:new Date().toISOString(),checks:[],scope:'Installed synthetic carrier only; no external APIs'};
const pass=s=>{report.checks.push(s);console.log('PASS '+s);};
const id='steward.carrier.simulator',w='worker-3';
const mod=async(p,method='GET',body,status=200)=>(await api(w,'/api/v3/modules/'+id+'/api'+p,method,body,status)).value;
const installed=async()=>(await api(w,'/api/v3/modules')).value.installed;
const snapshot=rows=>rows.filter(m=>m.moduleId!==id).map(m=>({moduleId:m.moduleId,version:m.version,operationId:m.operationId,imageId:m.imageId,configurationHash:createHash('sha256').update(JSON.stringify(m.configuration)).digest('hex')})).sort((a,b)=>a.moduleId.localeCompare(b.moduleId));
let browser,client;
try{
 await login(w,credentials.accounts[w]);
 if(!state.before){state.before=snapshot(await installed());await writeFile(stateFile,JSON.stringify(state,null,2));}
 let m=(await installed()).find(m=>m.moduleId===id);
 if(!m)await api(w,'/api/v3/modules/install','POST',{packageId:id+'@1.0.1',operationId:state.operationId,configuration:{mode:'simulator'}});
 else if(m.version!=='1.0.1'){
  state.upgradeOperationId??=randomUUID();await writeFile(stateFile,JSON.stringify(state,null,2));
  await api(w,'/api/v3/modules/install','POST',{packageId:id+'@1.0.1',operationId:state.upgradeOperationId,configuration:m.configuration,upgrade:true});
 }
 m=await waitFor(async()=>{const r=(await installed()).find(m=>m.moduleId===id);assert.notEqual(r?.state,'failed');return r&&r.state!=='installing'?r:null;},'signed installation',120000);
 if(m.state!=='active')await api(w,'/api/v3/modules/'+id+'/lifecycle','POST',{action:'activate'});
 await waitFor(async()=>{try{return (await mod('/connections')).records.length===1;}catch{return false;}},'module startup');
 pass('Signed independent simulator installed and active');report.module={version:m.version,operationId:m.operationId,imageId:m.imageId};
 browser=await chromium.launch({headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1500,height:1000}}),cookie=sessions[w].cookie;
 await context.addCookies([{name:cookie.split('=')[0],value:cookie.slice(cookie.indexOf('=')+1),url:origin(w),secure:true,httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage();page.setDefaultTimeout(30000);page.on('dialog',d=>d.accept());
 await page.goto(origin(w)+'/#/business');
 // Navigate through the module's signed declarative contribution, not a custom screen.
 await page.getByRole('searchbox',{name:'Find a business page'}).fill('Synthetic Shipments');
 await page.getByRole('link',{name:'Synthetic Shipments',exact:true}).first().click();
 let r=(await mod('/shipments')).records.find(r=>r.reference===state.reference);
 if(!r){await page.getByLabel('Registration reference',{exact:true}).fill(state.reference);await page.getByLabel('Synthetic tracking number (SIM-...)',{exact:true}).fill('SIM-'+state.reference.toUpperCase());await page.getByRole('button',{name:'Create record',exact:true}).click();r=await waitFor(async()=>(await mod('/shipments')).records.find(r=>r.reference===state.reference),'browser registration');}
 state.registrationId=r.id;await writeFile(stateFile,JSON.stringify(state,null,2));
 await page.screenshot({path:path.join(dir,'shipments.png'),fullPage:true});pass('Browser discovers module and creates persistent synthetic tracking registration');
 const record=async()=>(await mod('/shipments?q='+r.id)).records[0];
 const action=async name=>{const current=await record();return mod('/'+name+'/'+r.id,'POST',{revision:current.revision,requestId:randomUUID()});};
 await action('recover');await action('sync-tracking');await waitFor(async()=>(await record()).lastSuccessfulSyncAt,'retained initial sync');
 for(let i=0;i<3;i++){const current=await record();if(current.status==='delivered')break;await action('advance');await action('sync-tracking');await waitFor(async()=>(await record()).status!==current.status,'synthetic progression');}
 assert.equal((await record()).status,'delivered');assert.equal((await record()).shipmentDelivered,null);pass('Actual persisted sync advances to delivered while whole-shipment completion remains unknown');
 const smart=async()=>(await api(w,'/api/v8/smart-modules')).value;
 const registry=await smart(),provider=registry.providers.find(p=>p.moduleId===id&&p.capability.capabilityId==='shipping.tracking.sync');assert(provider);
 await api(w,'/api/v8/smart-modules/resolve','POST',{consumerId:id,capabilityId:'shipping.tracking.sync',preferredProvider:id});
 if(!registry.bindings.some(b=>b.binding_id===state.bindingId))await api(w,'/api/v8/smart-modules/bindings','POST',{bindingId:state.bindingId,consumerId:id,capabilityId:'shipping.tracking.sync',providerId:id,packageDigest:provider.packageDigest,reason:'Synthetic carrier acceptance; local simulator only.'});
 let workflow=(await smart()).workflows.find(v=>v.workflow_id===state.workflowId);
 if(!workflow){await api(w,'/api/v8/smart-modules/workflows','POST',{workflowId:state.workflowId,name:'Synthetic carrier tracking acceptance',version:1,consumerId:id,steps:[{bindingId:state.bindingId,operation:'tracking.sync'}],reason:'Synthetic carrier acceptance; no external operations.'});workflow={state:'proposed'};}
 if(workflow.state==='proposed')await api(w,'/api/v8/smart-modules/workflows/'+state.workflowId+'/lifecycle','POST',{action:'approve',reason:'Approve synthetic carrier-only acceptance workflow.'});
 if(workflow.state!=='active')await api(w,'/api/v8/smart-modules/workflows/'+state.workflowId+'/lifecycle','POST',{action:'activate',reason:'Activate synthetic carrier-only acceptance workflow.'});
 const routed=await action('governed-sync');report.governedCommand=routed;
 await waitFor(async()=>(await smart()).routes.some(route=>route.consumer_id===id&&route.state==='completed'),'governed durable route',90000);pass('Verified registry, resolver, approved binding and active workflow deliver a durable synthetic sync');
 client=await mcp(w);const tools=await client.listTools();const tool=tools.tools.find(t=>t.name.includes('carrier_simulator_shipments'));assert(tool,'Installed MCP discovery');const response=await client.callTool({name:tool.name,arguments:{q:r.id,limit:20,offset:0}});assert(!response.isError);assert(JSON.stringify(response).includes('delivered'));pass('Genuine Worker MCP discovers and reads retained delivered observation');report.mcp={tool:tool.name,response};
 await action('outage');await action('sync-tracking');await waitFor(async()=>(await record()).syncError==='SIMULATED_OUTAGE','outage evidence');assert.equal((await record()).status,'delivered');await action('recover');await waitFor(async()=>!(await record()).syncError,'durable retry recovery',60000);pass('Simulated provider outage preserves local evidence and recovers through persisted retry');
 const containers=docker(['ps','-q','--filter','label=steward.module='+id]).split(/\s+/).filter(Boolean);assert.equal(containers.length,1);docker(['restart',containers[0]]);await waitFor(async()=>{try{return(await record()).status==='delivered';}catch{return false;}},'module restart');pass('Isolated module restart preserves observations and registration');
 assert.deepEqual(snapshot(await installed()),state.before);pass('Existing Worker 3 module versions, identities, images and configuration hashes preserved');
 await page.reload();await page.screenshot({path:path.join(dir,'retained-delivery.png'),fullPage:true});
 report.status='passed';
}catch(e){report.status='failed';report.error=e.message;throw e;}finally{await client?.close();await browser?.close();await writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));}
