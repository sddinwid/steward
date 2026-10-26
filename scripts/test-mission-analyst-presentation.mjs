// Chromium presentation fixtures only; no deployed backend/provider claim.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
const id=randomUUID(),account=randomUUID(),now=new Date().toISOString(),errors=[];
let currency='USD';
const result=()=>({narrative:'Synthetic conditional five-unit planning recommendation; human review required.',assumptions:['Explicit unit-cost and capacity assumptions.'],humanDecisions:['Review each company approval.'],analyses:[{missionCalculationId:randomUUID(),supportingReferences:[{entityId:randomUUID(),installationId:randomUUID(),moduleId:'independent.housing',streamId:'mission_aggregates_v1',recordId:randomUUID(),revision:1}],releaseEvidence:[{release:{synthetic:true,participantCount:6,participantCounts:{housingRetainedParticipants:null}}}],allocationEvidence:[],calculation:{capabilityId:'steward.mission.sustainability',financial:{currency,approvedAvailableCents:500000,actualOperatingCostCents:600000,resourceGapCents:0},planning:{maximumAdditionalUnits:5,incrementalUnitCostCents:100000,additionalCostCents:500000},scientific:{engine:{version:'1.1.0'},calculation:{maximumAdditionalUnits:5}},limitations:['No decision executed; unknown retention is not zero.']}}]});
const run=()=>({investigation_id:id,status:'completed',provider:'ollama',test_model:false,result:result(),created_at:now,updated_at:now,prompt:'Presentation fixture only',title:'Mission presentation fixture',affectedEntities:[],findingCount:0});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
try{
 await page.route('https://mission-presentation.test/**',async route=>{
  const request=route.request(),p=new URL(request.url()).pathname;assert.equal(request.method(),'GET','Presentation verification must not publish or create an investigation');
  const data=p==='/api/v2/auth/session'?{account:{account_id:account,username:'presentation-only',role:'registry_admin'},csrfToken:'presentation-only'}:p==='/api/v2/workspace/profile'?{name:'Mission presentation',entityId:account,preferences:{baseCurrency:'USD',locale:'en-US'},administrator:true}:p==='/api/v4/analytics'?{entities:[],records:[],relationships:[]}:p==='/api/v5/analyst/config'?{configured:false}:p==='/api/v5/analyst/provider-status'?{configured:false,state:'not-configured'}:p==='/api/v5/analyst/investigations/'+id?{investigation:run(),activity:[]}:p==='/api/v5/analyst/investigations'?{investigations:[run()],total:1,nextOffset:null}:p.startsWith('/api/')?{}:undefined;
  if(data!==undefined)return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  const root=path.resolve('apps/master-web/dist'),file=p.startsWith('/assets/')?path.resolve(root,'.'+p):path.join(root,'index.html');assert(file.startsWith(root+path.sep));return route.fulfill({contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html',body:await readFile(file)});
 });
 await page.goto('https://mission-presentation.test/#/business/history/'+id);await page.getByTestId('analyst-evidence').waitFor();const evidence=page.getByTestId('mission-analyst-calculation');await evidence.waitFor();assert((await evidence.innerText()).includes('5,000.00'));assert((await evidence.innerText()).includes('1,000.00'));assert((await page.locator('section[aria-label="AI Analyst"]').innerText()).includes(result().narrative));
 await page.getByText('Authorized fixed-cohort release evidence',{exact:true}).click();assert((await evidence.innerText()).includes('Unknown'));await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/phase13-mission-analyst-presentation.png',fullPage:true});
 await page.reload();await page.getByTestId('analyst-evidence').waitFor();currency=undefined;await page.reload();await page.getByText('Source currency is unknown; monetary amounts are unavailable.',{exact:true}).waitFor();assert(!(await page.getByTestId('mission-analyst-calculation').innerText()).includes('5,000.00'));assert.deepEqual(errors,[]);
 await writeFile('artifacts/phase13-mission-analyst-presentation.json',JSON.stringify({status:'passed',checks:5,chromium:true,presentationFixtures:true,deploymentOrProviderValidation:false,errors},null,2)+'\n');console.log('PASS 5 Chromium mission Analyst presentation checks; fixtures only.');
}finally{await browser.close();}
