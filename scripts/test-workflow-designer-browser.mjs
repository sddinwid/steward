// Component-only browser evidence; no authenticated module/deployment claim.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {build} from 'vite';
import {chromium} from 'playwright';
const report={scope:'Isolated SSDS workflow designer, synthetic binding fixture; no backend authority or installed-module acceptance.',checks:[],pageErrors:[],screenshots:[]};
let browser,server;
async function check(name,run){try{await run();report.checks.push({name,status:'passed'});console.log('PASS '+name);}catch(e){report.checks.push({name,status:'failed',error:e.message});throw e;}}
try{
 const result=await build({configFile:false,logLevel:'error',build:{write:false,rollupOptions:{input:'scripts/fixtures/workflow-designer-browser.html'}}});
 const files=new Map((Array.isArray(result)?result:[result]).flatMap(r=>r.output.map(f=>['/'+f.fileName,f])));
 server=createServer((req,res)=>{const file=files.get(req.url==='/'?'/scripts/fixtures/workflow-designer-browser.html':req.url);if(!file){res.statusCode=404;res.end();return;}res.setHeader('content-type',file.fileName.endsWith('.html')?'text/html':file.fileName.endsWith('.css')?'text/css':'text/javascript');res.end(file.type==='chunk'?file.code:file.source);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>report.pageErrors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
 await check('starter is explicit; nodes are reachable and editable with keyboard',async()=>{
  assert.equal(await page.getByTestId('graph').textContent(),'null');await page.getByRole('button',{name:'Use starter workflow'}).focus();await page.keyboard.press('Enter');
  await page.getByLabel('New step type').selectOption('action');await page.getByRole('button',{name:'Add step',exact:true}).click();await page.getByLabel('Step label',{exact:true}).fill('Reserve synthetic stock');
  await page.getByLabel('Approved capability binding').selectOption('00000000-0000-4000-8000-000000000001');await page.getByLabel('Operation',{exact:true}).selectOption('reserve');
  assert.equal(JSON.parse(await page.getByTestId('graph').textContent()).nodes[2].operation,'reserve');
 });
 await check('malformed mappings cannot appear to save successfully',async()=>{
  await page.getByRole('button',{name:'Save fixture'}).click();const previous=await page.getByTestId('saved').textContent();
  await page.getByLabel('Input mappings (data-only expressions)').fill('{broken');await page.getByRole('button',{name:'Save fixture'}).click();
  assert.equal(await page.getByTestId('saved').textContent(),previous);assert.equal(await page.getByLabel('Input mappings (data-only expressions)').evaluate(e=>e.validity.valid),false);
  await page.getByLabel('Input mappings (data-only expressions)').fill('{"quantity":{"literal":2}}');assert.equal(await page.getByLabel('Input mappings (data-only expressions)').evaluate(e=>e.validity.valid),true);
 });
 await check('visual connections are explicit and validation identifies unconnected steps',async()=>{
  const graph=JSON.parse(await page.getByTestId('graph').textContent()),id=graph.nodes[2].id;
  await page.getByRole('button',{name:'Remove connection 1',exact:true}).click();await page.getByLabel('From step').selectOption('start');await page.getByLabel('To step').selectOption(id);await page.getByRole('button',{name:'Connect steps',exact:true}).click();
  await page.getByLabel('From step').selectOption(id);await page.getByLabel('To step').selectOption('complete');await page.getByRole('button',{name:'Connect steps',exact:true}).click();
  assert.equal(await page.getByText('Validation (0 issues)',{exact:true}).count(),1);
 });
 await check('synthetic dry-run demands assumptions, never changes the saved graph, and invalidates stale results',async()=>{
  const before=await page.getByTestId('graph').textContent();await page.getByText('Synthetic dry-run',{exact:true}).click();await page.getByRole('button',{name:'Run synthetic dry-run',exact:true}).click();assert(await page.getByText(/Synthetic result: blocked/).count());
  await page.getByLabel('Synthetic outcome: Reserve synthetic stock').selectOption('succeeded');await page.getByRole('button',{name:'Run synthetic dry-run',exact:true}).click();assert(await page.getByText(/Synthetic result: preview-completed/).count());assert.equal(await page.getByTestId('graph').textContent(),before);
  await page.getByLabel('Input mappings (data-only expressions)').fill('{broken');assert.equal(await page.getByText(/Synthetic result: preview-completed/).count(),0);assert.equal(await page.getByRole('button',{name:'Run synthetic dry-run',exact:true}).isDisabled(),true);await page.getByLabel('Input mappings (data-only expressions)').fill('{\"quantity\":{\"literal\":2}}');
  await page.getByLabel('Synthetic outcome: Reserve synthetic stock').selectOption('timeout');assert.equal(await page.getByText(/Synthetic result: preview-completed/).count(),0);await page.getByRole('button',{name:'Run synthetic dry-run',exact:true}).click();assert(await page.getByText(/Synthetic result: failed/).count());
 });
 await check('guided conditions use declared typed fields and preserve advanced expression editing',async()=>{
  await page.getByLabel('New step type').selectOption('condition');await page.getByRole('button',{name:'Add step',exact:true}).click();await page.getByLabel('Condition field',{exact:true}).selectOption('trigger.quantity');await page.getByLabel('Comparison',{exact:true}).selectOption('gte');await page.getByLabel('Comparison value',{exact:true}).fill('3');await page.getByRole('button',{name:'Apply comparison',exact:true}).click();
  const graph=JSON.parse(await page.getByTestId('graph').textContent()),condition=graph.nodes.find(n=>n.kind==='condition').condition;assert.deepEqual(condition,{op:'gte',args:[{field:'trigger.quantity'},{literal:3}]});assert.deepEqual(JSON.parse(await page.getByLabel('Condition (data-only rule)').inputValue()),condition);
  await page.getByRole('button',{name:'Remove selected step and its connections',exact:true}).click();await page.getByRole('button',{name:'Reserve synthetic stock · Action',exact:true}).click();
 });
 await check('read-only graph exposes inspection without editing or connection controls',async()=>{
  await page.getByRole('button',{name:'Toggle read-only'}).click();assert.equal(await page.getByRole('button',{name:'Add step',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Connect steps',exact:true}).count(),0);
  assert.equal(await page.getByLabel('Step label',{exact:true}).getAttribute('readonly'),'');
 });
 await check('responsive layout keeps accessible controls and a bounded scrollable diagram',async()=>{
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Toggle read-only'}).click();await page.getByRole('button',{name:'Reserve synthetic stock · Action'}).click();
  assert.equal(await page.getByLabel('Step label',{exact:true}).inputValue(),'Reserve synthetic stock');
  report.overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>window.innerWidth+2).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(0,12));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true);
 });
 await check('reusable templates remain unbound drafts and preserve the last saved workflow',async()=>{
  const saved=await page.getByTestId('saved').textContent();await page.getByText('Reusable workflow templates',{exact:true}).click();await page.getByLabel('Workflow template',{exact:true}).selectOption('parallel');await page.getByRole('button',{name:'Replace draft with selected template',exact:true}).click();const graph=JSON.parse(await page.getByTestId('graph').textContent());assert.equal(graph.limits.maxParallel,2);assert.equal(graph.nodes.filter(n=>n.kind==='action').length,2);assert(graph.nodes.filter(n=>n.kind==='action').every(n=>n.bindingId===''&&n.operation===''));assert.equal(await page.getByTestId('saved').textContent(),saved);assert.notEqual(await page.getByText('Validation (0 issues)',{exact:true}).count(),1);
 });
 await mkdir('artifacts',{recursive:true});const screenshot='artifacts/phase16-workflow-designer-component.png';await page.screenshot({path:screenshot,fullPage:true});report.screenshots.push(screenshot);assert.deepEqual(report.pageErrors,[]);report.status='passed';
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await mkdir('artifacts',{recursive:true});await writeFile('artifacts/phase16-workflow-designer-component.json',JSON.stringify(report,null,2)+'\n');}
