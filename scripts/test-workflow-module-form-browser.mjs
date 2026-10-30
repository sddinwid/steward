// Component-only browser evidence; no authenticated module/deployment claim.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {build} from 'vite';
import {chromium} from 'playwright';
const report={scope:'Full generic ModuleConsole form with synthetic authenticated gateway responses; no installed runtime acceptance.',checks:[],pageErrors:[],screenshots:[]};
let browser,server;
async function check(name,run){try{await run();report.checks.push({name,status:'passed'});console.log('PASS '+name);}catch(e){report.checks.push({name,status:'failed',error:e.message});throw e;}}
try{
 const result=await build({configFile:false,logLevel:'error',build:{write:false,rollupOptions:{input:'scripts/fixtures/workflow-module-form-browser.html'}}});
 const files=new Map((Array.isArray(result)?result:[result]).flatMap(r=>r.output.map(f=>['/'+f.fileName,f])));
 server=createServer((req,res)=>{const file=files.get(req.url==='/'?'/scripts/fixtures/workflow-module-form-browser.html':req.url);if(!file){res.statusCode=404;res.end();return;}res.setHeader('content-type',file.fileName.endsWith('.html')?'text/html':file.fileName.endsWith('.css')?'text/css':'text/javascript');res.end(file.type==='chunk'?file.code:file.source);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>report.pageErrors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
 await check('generic module form discovers scalar fields through signed metadata',async()=>{
  await page.getByText('Existing workflow',{exact:true}).waitFor();
  assert.equal(await page.getByText('Existing workflow',{exact:true}).isVisible(),true);
  assert.equal(await page.locator('.workflow-record-form').getAttribute('open'),null);
  await page.getByText('Create workflow',{exact:true}).click();
  await page.getByLabel('Workflow name',{exact:true}).fill('Module form discovery');
  await page.getByRole('button',{name:'Use starter workflow'}).click();
  await page.getByLabel('New step type').selectOption('condition');await page.getByRole('button',{name:'Add step',exact:true}).click();
  await page.getByLabel('Condition field',{exact:true}).selectOption('trigger.reference');
  await page.getByLabel('Event selection',{exact:true}).selectOption('changed');
  await page.getByLabel('Condition field',{exact:true}).selectOption('trigger.quantity');
  const options=await page.getByLabel('Condition field',{exact:true}).locator('option').evaluateAll(es=>es.map(e=>e.value));
  assert(!options.includes('trigger.reference'));assert(!options.some(v=>v.includes('lines')));
 });
 await check('approved action outputs appear in the actual module form',async()=>{
  await page.getByText('Reusable workflow templates',{exact:true}).click();await page.getByRole('button',{name:'Replace draft with selected template',exact:true}).click();
  await page.getByLabel('Approved capability binding').selectOption('00000000-0000-4000-8000-000000000001');await page.getByLabel('Operation',{exact:true}).selectOption('inspect');
  await page.getByLabel('New step type').selectOption('condition');await page.getByRole('button',{name:'Add step',exact:true}).click();await page.getByLabel('Step label',{exact:true}).fill('Quantity threshold');
  await page.getByLabel('Condition field',{exact:true}).selectOption('first.count');
  await page.getByLabel('Condition field',{exact:true}).selectOption('trigger.quantity');await page.getByLabel('Comparison',{exact:true}).selectOption('gte');await page.getByLabel('Comparison value',{exact:true}).fill('5');await page.getByRole('button',{name:'Apply comparison',exact:true}).click();
  const conditionId=await page.getByLabel('From step').locator('option').evaluateAll(es=>es.find(e=>e.textContent==='Quantity threshold').value);
  await page.getByLabel('New step type').selectOption('completion');await page.getByRole('button',{name:'Add step',exact:true}).click();await page.getByLabel('Step label',{exact:true}).fill('Below threshold');
  const belowId=await page.getByLabel('From step').locator('option').evaluateAll(es=>es.find(e=>e.textContent==='Below threshold').value);
  await page.getByRole('button',{name:'Quantity threshold · Condition',exact:true}).click();
  while(await page.getByRole('button',{name:'Remove connection 1',exact:true}).count())await page.getByRole('button',{name:'Remove connection 1',exact:true}).click();
  for(const [from,to,port]of [['start',conditionId,'next'],[conditionId,'first','true'],[conditionId,belowId,'false'],['first','complete','next']]){await page.getByLabel('From step').selectOption(from);await page.getByLabel('To step').selectOption(to);await page.getByLabel(/^Outcome/).selectOption(port);await page.getByRole('button',{name:'Connect steps',exact:true}).click();}
  assert.equal(await page.getByText('Validation (0 issues)',{exact:true}).count(),1,await page.locator('body').innerText());
 });
 await check('full form previews a declared condition without provider effects',async()=>{
  await page.getByText('Synthetic dry-run',{exact:true}).click();await page.getByLabel('Synthetic value: trigger.quantity',{exact:true}).fill('8');await page.getByLabel(/^Synthetic outcome: Configure action/).selectOption('succeeded');await page.getByRole('button',{name:'Run synthetic dry-run',exact:true}).click();
  assert.equal(await page.getByText(/Synthetic result: preview-completed/).count(),1);
  assert.equal(await page.evaluate(()=>window.__workflowModuleForm.calls.some(c=>c.method!=='GET')),false);
 });
 await check('failed discovery invalidates preview and removes stale fields',async()=>{
  await page.evaluate(()=>window.__workflowModuleForm.fail=true);await page.getByLabel('Event selection',{exact:true}).selectOption('alternate');
  await page.getByText('SYNTHETIC_TRIGGER_DISCOVERY_FAILURE',{exact:false}).waitFor();
  assert.equal(await page.getByText(/Synthetic result: preview-completed/).count(),0);assert.equal(await page.getByRole('button',{name:'Run synthetic dry-run',exact:true}).isDisabled(),true);
  assert.equal(await page.getByLabel('Condition field',{exact:true}).locator('option[value="trigger.quantity"]').count(),0);
 });
 await check('late discovery responses cannot replace the selected contract',async()=>{
  await page.evaluate(()=>{window.__workflowModuleForm.fail=false;window.__workflowModuleForm.slow=true;});await page.getByLabel('Event selection',{exact:true}).selectOption('changed');await page.getByLabel('Event selection',{exact:true}).selectOption('alternate');
  await page.getByLabel('Condition field',{exact:true}).selectOption('trigger.ready');await page.waitForTimeout(550);
  assert.equal(await page.getByLabel('Condition field',{exact:true}).locator('option[value="trigger.quantity"]').count(),0);
  await page.evaluate(()=>window.__workflowModuleForm.slow=false);await page.getByLabel('Event selection',{exact:true}).selectOption('changed');await page.getByLabel('Condition field',{exact:true}).selectOption('trigger.quantity');
 });
 await check('ordinary submission preserves graph and declared trigger selection',async()=>{
  await page.getByRole('button',{name:'Create record',exact:true}).click();await page.waitForFunction(()=>window.__workflowModuleForm.saved!==null);
  const saved=await page.evaluate(()=>window.__workflowModuleForm.saved);assert.equal(saved.eventChoice,'changed');assert.equal(saved.name,'Module form discovery');assert.equal(saved.definition.nodes.find(n=>n.id==='first').operation,'inspect');assert.deepEqual(saved.definition.nodes.find(n=>n.kind==='condition').condition,{op:'gte',args:[{field:'trigger.quantity'},{literal:5}]});
 });
 await mkdir('artifacts',{recursive:true});const screenshot='artifacts/phase16-workflow-module-form-component.png';await page.screenshot({path:screenshot,fullPage:true});report.screenshots.push(screenshot);assert.deepEqual(report.pageErrors,[]);report.status='passed';
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await mkdir('artifacts',{recursive:true});await writeFile('artifacts/phase16-workflow-module-form-component.json',JSON.stringify(report,null,2)+'\n');}
