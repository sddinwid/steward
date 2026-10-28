import {createRoot} from 'react-dom/client';
import {WorkflowGovernance} from '../../packages/ui/src/workflow-governance.js';
import '../../packages/ui/src/style.css';
const moduleId='example.workflow-source',publicationId=crypto.randomUUID();
const source={moduleId,name:'Synthetic independent workflow source',moduleInstallationId:crypto.randomUUID(),packageDigest:'a'.repeat(64),publicationPath:'/published-versions'};
const graph={graphVersion:1,nodes:[{id:'start',kind:'trigger',label:'Start'},{id:'approve',kind:'approval',label:'Human decision',approverPermission:moduleId+'.review',separateInitiator:true,expiresAfterMs:60000},{id:'done',kind:'completion',label:'Approved'},{id:'reject',kind:'completion',label:'Rejected'},{id:'expire',kind:'completion',label:'Expired'}],edges:[{from:'start',to:'approve',port:'next'},{from:'approve',to:'done',port:'approved'},{from:'approve',to:'reject',port:'rejected'},{from:'approve',to:'expire',port:'expired'}],limits:{elapsedMs:600000,maxParallel:1,maxActions:1}};
const publication={id:publicationId,executionAllowed:true,name:'Synthetic approval workflow · version 1',definitionDigest:'b'.repeat(64),definition:{graph,fields:{}},review:{id:crypto.randomUUID(),decision:'approve',reviewerId:crypto.randomUUID(),expiresAt:new Date(Date.now()+3600000).toISOString()}};
const data:{workflows:any[];executions:any[]}={workflows:[],executions:[]};
const events:{subscriptions:any[];deliveries:any[]}={subscriptions:[],deliveries:[]};
const fixture={events,data,loseReplay:true,calls:[] as any[],failImport:true,loseStart:true,publicationId};(window as any).__workflowGovernanceFixture=fixture;
async function api(path:string,method='GET',body?:any):Promise<any>{
 fixture.calls.push({path,method,body:structuredClone(body)});
 if(path==='/v16/workflows/event-subscriptions'&&method==='GET')return structuredClone(events);
 if(path==='/v16/workflows/event-subscriptions'&&method==='POST'){events.subscriptions.push({subscription_id:body.subscriptionId,workflow_id:body.workflowId,provider_id:'example.event-source',event_name:'record.changed',state:'active',source_module_installation_id:source.moduleInstallationId,source_package_digest:source.packageDigest});return{};}
 if(path.includes('/event-subscriptions/')&&path.endsWith('/lifecycle')){events.subscriptions[0].state=body.action==='resume'?'active':'suspended';return{};}
 if(path.includes('/event-subscriptions/')&&path.endsWith('/replay')){events.deliveries[0].state='delivered';if(fixture.loseReplay){fixture.loseReplay=false;throw Error('SYNTHETIC_RECOVERY_RESPONSE_LOST');}return{replayed:true};}

 if(path==='/v16/workflows')return structuredClone(data);
 if(path.startsWith('/v3/modules/')){const {definition,...summary}=structuredClone(publication);return{records:[path.includes('?q=')?{...summary,definition}:summary]};}
 if(path==='/v16/workflows/import'){
  if(fixture.failImport){fixture.failImport=false;throw Error('SYNTHETIC_REVIEW_REVOKED');}
  if(!data.workflows.length)data.workflows.push({workflow_id:publicationId,consumer_id:moduleId,version:1,name:'Internal identifier',definition:{displayName:'Synthetic approval workflow'},state:'proposed',accepting_new:false});return{state:'proposed'};
 }
 if(path.endsWith('/lifecycle')){Object.assign(data.workflows[0],{state:body.action==='activate'?'active':'suspended',accepting_new:body.action==='activate'});return{};}
 if(path==='/v16/workflows/execute'){
  if(!data.executions.some(e=>e.execution_id===body.executionId))data.executions.push({execution_id:body.executionId,workflow_id:publicationId,state:'pending',error_code:null,progress:{start:{state:'completed'},approve:{state:'waiting'}}});
  if(fixture.loseStart){fixture.loseStart=false;throw Error('SYNTHETIC_RESPONSE_LOST');}return{executionId:body.executionId};
 }
 if(path.endsWith('/reviews')){data.executions[0].progress.approve={state:'completed'};data.executions[0].state='completed';return{};}
 if(path.endsWith('/cancel')){data.executions[0].state='suspended';data.executions[0].error_code='WORKFLOW_CANCELLED';return{};}
 throw Error('Unexpected synthetic fixture request');
}
createRoot(document.getElementById('root')!).render(<main className="application-shell"><div className="content module-console"><h1>Workflow governance component fixture</h1><p>Simulated browser responses only. No accounts, installed modules or real execution effects.</p><WorkflowGovernance api={api} sources={[source]}/></div></main>);
