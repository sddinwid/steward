// Component-only browser evidence; no authenticated module/deployment claim.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {build} from 'vite';
import {chromium} from 'playwright';
const report={scope:'Isolated generic governance UI with synthetic responses; real authentication is covered separately, no installed deployment or business effects.',checks:[],pageErrors:[],screenshots:[]};
let browser,server;
async function check(name,run){try{await run();report.checks.push({name,status:'passed'});console.log('PASS '+name);}catch(e){report.checks.push({name,status:'failed',error:e.message});throw e;}}
try{
 const result=await build({configFile:false,logLevel:'error',build:{write:false,rollupOptions:{input:'scripts/fixtures/workflow-governance-browser.html'}}});
 const files=new Map((Array.isArray(result)?result:[result]).flatMap(r=>r.output.map(f=>['/'+f.fileName,f])));
 server=createServer((req,res)=>{const file=files.get(req.url==='/'?'/scripts/fixtures/workflow-governance-browser.html':req.url);if(!file){res.statusCode=404;res.end();return;}res.setHeader('content-type',file.fileName.endsWith('.html')?'text/html':file.fileName.endsWith('.css')?'text/css':'text/javascript');res.end(file.type==='chunk'?file.code:file.source);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>report.pageErrors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
 await check('independently named module contributes its publication and generic read-only graph',async()=>{
  await page.getByLabel('Workflow source',{exact:true}).selectOption('example.workflow-source');
  const id=await page.evaluate(()=>window.__workflowGovernanceFixture.publicationId);await page.getByLabel('Published workflow version').selectOption(id);
  assert.equal(await page.getByRole('button',{name:'Add step',exact:true}).count(),0);await page.getByRole('button',{name:'Human decision · Approval',exact:true}).click();
  assert.equal(await page.getByLabel('Approver permission',{exact:true}).inputValue(),'example.workflow-source.review');
 });
 await check('failed import is visible and cannot appear activated or successfully saved',async()=>{
  await page.getByLabel('Workflow governance reason').fill('Explicit synthetic browser review for a bounded workflow.');await page.getByRole('button',{name:'Import reviewed version'}).click();
  await page.getByRole('alert').filter({hasText:'SYNTHETIC_REVIEW_REVOKED'}).waitFor();assert.equal(await page.getByRole('button',{name:'Activate workflow',exact:true}).count(),0);
  await page.getByRole('button',{name:'Import reviewed version'}).click();await page.getByRole('button',{name:'Activate workflow',exact:true}).waitFor();
 });
 await check('lost start response retains the same execution identity for a safe UI retry',async()=>{
  await page.getByRole('button',{name:'Activate workflow',exact:true}).click();await page.getByLabel('Workflow run reference').fill('SYNTHETIC-BROWSER-REQUEST');await page.getByRole('button',{name:'Start workflow',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'SYNTHETIC_RESPONSE_LOST'}).waitFor();assert.equal(await page.getByLabel('Workflow run reference').isDisabled(),true);
  await page.getByRole('button',{name:'Retry same start',exact:true}).click();await page.getByRole('button',{name:'Approve step',exact:true}).waitFor();
  const calls=await page.evaluate(()=>window.__workflowGovernanceFixture.calls.filter(c=>c.path==='/v16/workflows/execute'));assert.equal(calls.length,2);assert.deepEqual(calls[0].body,calls[1].body);
 });
 await check('human review controls show pending progress and publish only the declared decision request',async()=>{
  await page.getByRole('button',{name:'Approve step',exact:true}).click();await page.getByText('completed · No reported failure',{exact:true}).waitFor();
  const decisions=await page.evaluate(()=>window.__workflowGovernanceFixture.calls.filter(c=>c.path.endsWith('/reviews')));assert.equal(decisions.length,1);assert.equal(decisions[0].body.nodeId,'approve');assert.equal(decisions[0].body.decision,'approve');
 });
 await check('governance controls and execution graphs remain bounded on a narrow screen',async()=>{
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true);
 });
 await mkdir('artifacts',{recursive:true});const screenshot='artifacts/phase16-workflow-governance-component.png';await page.screenshot({path:screenshot,fullPage:true});report.screenshots.push(screenshot);assert.deepEqual(report.pageErrors,[]);report.status='passed';
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await mkdir('artifacts',{recursive:true});await writeFile('artifacts/phase16-workflow-governance-component.json',JSON.stringify(report,null,2)+'\n');}
