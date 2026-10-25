// Presentation-only Chromium checks with intercepted API fixtures. This is NOT
// deployed authentication, synchronization or provider acceptance.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {forecastProcurement} from '../packages/platform/dist/scientific-schema.js';
const fixture=JSON.parse(await readFile('datasets/scientific-history-v1.json','utf8'));
const ids=[randomUUID(),randomUUID()],operator=randomUUID(),datasetId=randomUUID(),now=new Date().toISOString();
const entities=[...ids.map((entity_id,i)=>({entity_id,name:'Presentation company '+(i+1),classification:'synthetic_business'})),{entity_id:operator,name:'Presentation Master',classification:'platform_operator'}];
const content={...fixture,interval:'day',coverage:'declared-complete',series:fixture.series.map(({entityKey,...s},i)=>({...s,entityId:ids[i]}))};
const dataset={dataset_id:datasetId,entity_ids:ids,basis:'synthetic-analytical-history',synthetic:true,label:fixture.label,content,created_at:now};
const calculate=(capability,parameters)=>JSON.parse(execFileSync('docker',['run','--rm','--network','none','-i','--entrypoint','python','steward-scientific:development','-c',"import json,sys;from steward_science.analysis import calculate;d=json.load(sys.stdin);print(json.dumps(calculate(d['capability'],d['parameters']),allow_nan=False))"],{encoding:'utf8',input:JSON.stringify({capability,parameters}),maxBuffer:4*1024*1024}));
const parameters={series:content.series,interval:'day',coverage:'declared-complete',horizon:30,method:'auto',seasonalPeriod:7,confidence:.9};
const forecast=calculate('demand-forecast',parameters),problem=forecastProcurement(dataset,forecast),procurement=calculate('procurement-optimization',problem);
const scenarioInput={baseline:problem,scenarios:[{name:'Demand +20%',changes:{demandBasisPoints:12000}},{name:'Capacity restricted',changes:{capacityBasisPoints:10}}],sensitivity:{parameter:'shippingBasisPoints',startBasisPoints:10000,endBasisPoints:12000,steps:3}};
const scenarios=calculate('scenario-comparison',scenarioInput);
const runs=[['demand-forecast',forecast,parameters],['procurement-optimization',procurement,problem],['scenario-comparison',scenarios,scenarioInput]].map(([capability,calculation,parameters])=>({job_id:randomUUID(),dataset_id:datasetId,entity_ids:ids,capability,state:'completed',created_at:now,finished_at:now,request:{parameters},result:{calculation,elapsedMillis:0,provenance:{synthetic:true,basis:dataset.basis,datasetId,asOf:now,references:[]}}}));
await mkdir('artifacts/phase12-presentation',{recursive:true});await writeFile('artifacts/phase12-presentation/calculations.json',JSON.stringify({presentationFixtures:true,actualPythonCalculations:true,runs},null,2));
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];
page.on('pageerror',e=>errors.push(e.stack??e.message));
async function screenshot(file){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'artifacts/phase12-presentation/'+file,fullPage:true});}
try{
 await page.route('https://presentation.test/**',async route=>{
  const url=new URL(route.request().url()),p=url.pathname;
  const data=p==='/api/v2/auth/session'?{account:{account_id:randomUUID(),username:'presentation-fixture',role:'registry_admin'},csrfToken:'presentation-fixture-only'}:p==='/api/v2/workspace/profile'?{name:'Presentation fixture',entityId:operator,preferences:{baseCurrency:'USD',locale:'en-US'},administrator:true}:p==='/api/v4/analytics'?{entities,operatingEntityId:operator,records:[],peers:[],relationships:[{relationship_id:randomUUID(),from_entity:ids[0],to_entity:ids[1],kind:'cooperation',description:'Presentation relationship fixture'}]}:p==='/api/v4/findings'?{findings:[],receipts:[]}:p==='/api/v4/financial-report'?{reports:[]}:p==='/api/v4/simulation-intelligence'?{companies:[],opportunities:[],conditions:[],policy:null,canConfigure:false}:p==='/api/v4/scientific'?{datasets:[dataset],runs,canPublish:true}:p==='/api/v4/scientific/datasets/'+datasetId?{dataset}:p.startsWith('/api/v4/scientific/runs/')?{run:runs.find(r=>r.job_id===p.split('/').at(-1))}:p.startsWith('/api/v5/analyst/investigations')?{investigations:[],nextOffset:null}:undefined;
  if(data!==undefined)return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  const file=p.startsWith('/assets/')?path.resolve('apps/master-web/dist','.'+p):path.resolve('apps/master-web/dist/index.html');
  assert(file.startsWith(path.resolve('apps/master-web/dist')+path.sep));
  return route.fulfill({contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html',body:await readFile(file)});
 });
 await page.goto('https://presentation.test/#/business/overview');await page.getByRole('heading',{name:'What needs your attention?'}).waitFor();await screenshot('executive.png');
 await page.getByRole('link',{name:'Companies & Relationships',exact:true}).click();await page.getByTestId('company-comparison').waitFor();await page.locator('.analytical-plot').first().scrollIntoViewIfNeeded();await page.locator('.analytical-plot svg').first().waitFor();await screenshot('companies-relationships.png');
 assert.equal(await page.getByRole('heading',{name:'What needs your attention?'}).count(),0);
 for(const r of runs){
  await page.goto('https://presentation.test/#/business/scientific/'+r.job_id);await page.getByTestId('scientific-result').waitFor();await page.getByTestId('scientific-result').scrollIntoViewIfNeeded();await page.locator('.analytical-chart').first().scrollIntoViewIfNeeded();await page.locator('.analytical-chart svg').first().waitFor();
  await screenshot(r.capability+'.png');
  if(r.capability==='demand-forecast'){await page.getByLabel('Demand forecast · synthetic-tee:standard visible intervals').first().selectOption('30');await page.getByText('Accessible chart values and evidence times',{exact:true}).first().click();assert(await page.getByRole('columnheader',{name:'Prediction upper'}).count()>0);}
 }
 await page.setViewportSize({width:390,height:844});await page.goto('https://presentation.test/#/business/scientific/'+runs[0].job_id);await page.getByTestId('scientific-result').waitFor();await screenshot('mobile.png');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks:8,chromium:true,presentationFixtures:true,actualPythonCalculations:true,backendOrDeploymentAcceptance:false,screenshots:'artifacts/phase12-presentation'}));
}finally{await browser.close();}
