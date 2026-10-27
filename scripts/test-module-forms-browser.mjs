// Isolated Chromium interaction acceptance for production generic SSDS components.
// API responses below are fixtures; this does not establish module/deployment acceptance.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {build} from 'vite';
import {chromium} from 'playwright';
const report={verificationVersion:1,startedAt:new Date().toISOString(),scope:'Isolated production generic SSDS renderer with synthetic in-memory API fixtures. No operator, database, packaged-module or commerce acceptance.',checks:[],screenshots:[]};
const records=[],calls=[],pageErrors=[];let failPreview=false,browser,server;
const check=async(name,run)=>{try{await run();report.checks.push({name,status:'passed'});console.log('PASS '+name);}catch(error){report.checks.push({name,status:'failed',error:error.message});throw error;}};
await mkdir('artifacts',{recursive:true});
try{
 const result=await build({configFile:false,logLevel:'error',build:{write:false,rollupOptions:{input:'scripts/fixtures/module-forms-browser.html'}}});
 const files=new Map((Array.isArray(result)?result:[result]).flatMap(r=>r.output.map(file=>['/'+file.fileName,file])));
 server=createServer(async(req,res)=>{
  try{
   const path=new URL(req.url,'http://localhost').pathname;
   if(path.startsWith('/api/')){
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>65536)throw Error('Fixture request too large');}const body=raw?JSON.parse(raw):undefined;
    res.setHeader('content-type','application/json');
    const send=(value,status=200)=>{res.statusCode=status;res.end(JSON.stringify(value));};
    if(path==='/api/fixture/observed'&&req.method==='GET')return send({calls,records});
    if(path==='/api/fixture/fail-next-preview'&&req.method==='POST'){failPreview=true;return send({ready:true});}
    if(path==='/api/v3/modules/example.forms/api/records'&&req.method==='GET')return send({records,nextOffset:null});
    if(path==='/api/v3/modules/example.forms/api/choices'&&req.method==='GET')return send({records:[{id:'authorized-reference',name:'Authorized synthetic component'}],nextOffset:null});
    if(path==='/api/v3/modules/example.forms/api/records'&&req.method==='POST'){calls.push({path,method:req.method,body});const record={...body,id:'00000000-0000-4000-8000-000000000001',revision:1};records.push(record);return send(record,201);}
    if(path==='/api/v3/modules/example.forms/api/preview'&&req.method==='POST'){calls.push({path,method:req.method,body});if(failPreview){failPreview=false;return send({error:'Synthetic preview unavailable; retry after review.'},503);}return send({report:{version:2,groups:[{title:'Resolved synthetic values',description:'Read-only preview; no business record created.',metrics:[{label:'Resolved amount',value:body.amount,currency:body.currency,format:'money'}]}]}});}
    return send({error:'Undeclared fixture API'},403);
   }
   const file=files.get(path==='/'?'/scripts/fixtures/module-forms-browser.html':path);if(!file){res.statusCode=404;res.end();return;}
   res.setHeader('content-type',file.fileName.endsWith('.html')?'text/html; charset=utf-8':file.fileName.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');res.end(file.type==='chunk'?file.code:file.source);
  }catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});const context=await browser.newContext({timezoneId:'America/Los_Angeles',viewport:{width:1440,height:1100}}),page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));await page.goto(origin);
 const editor=page.getByTestId('editor-fixture'),preview=page.getByTestId('preview-fixture'),denied=page.getByTestId('denied-fixture');
 await check('conditional fields and empty typed arrays support normal add/remove controls',async()=>{
  await editor.getByLabel('Name',{exact:true}).fill('Synthetic service');assert.equal(await editor.getByLabel('Optional measurements: Width',{exact:true}).getAttribute('required'),null);await editor.getByLabel('Optional measurements: Width',{exact:true}).fill('0');assert.notEqual(await editor.getByLabel('Optional measurements: Unit',{exact:true}).getAttribute('required'),null);await editor.getByLabel('Optional measurements: Width',{exact:true}).fill('');assert.equal(await editor.getByLabel('Optional measurements: Unit',{exact:true}).getAttribute('required'),null);await editor.getByLabel('Physical details: Weight',{exact:true}).fill('2');await editor.getByLabel('Kind',{exact:true}).selectOption('service');await assert.equal(await editor.getByLabel('Physical details: Weight',{exact:true}).count(),0);
  await editor.getByRole('button',{name:'Add components entry',exact:true}).click();await editor.getByRole('button',{name:'Add components entry',exact:true}).click();await editor.getByRole('button',{name:'Remove components entry 2',exact:true}).click();assert.equal(await editor.getByRole('button',{name:/Remove components entry/}).count(),1);
  assert.equal(await editor.getByText('Advanced structured data',{exact:true}).count(),0);await editor.getByLabel('Components 1: Component: Reference',{exact:true}).selectOption('authorized-reference');await editor.getByLabel('Components 1: Component: Quantity',{exact:true}).fill('2');await editor.getByLabel('Components 1: Component: Amount',{exact:true}).fill('90071992547409.91');await editor.getByLabel('Effective time',{exact:true}).fill('2026-07-01T05:30:00.123');await editor.getByLabel('Active',{exact:true}).selectOption('false');await editor.getByLabel('Notes',{exact:true}).fill('Synthetic multiline\nevidence');
  const path='artifacts/phase15a-module-forms-editor.png';await page.screenshot({path,fullPage:true});report.screenshots.push(path);
 });
 await check('actual browser submission preserves exact money, local datetime, false, and authorized nested reference',async()=>{
  await editor.getByRole('button',{name:'Create record',exact:true}).click();await editor.getByRole('cell',{name:'Synthetic service',exact:true}).waitFor();const observed=await(await context.request.get(origin+'/api/fixture/observed')).json();assert.equal(observed.records.length,1);assert.deepEqual(observed.records[0].components,[{reference:'authorized-reference',quantity:2,amount:Number.MAX_SAFE_INTEGER}]);assert.equal(observed.records[0].when,'2026-07-01T12:30:00.123Z');assert.equal(observed.records[0].active,false);assert.equal(observed.records[0].physical,undefined);assert.equal(observed.records[0].measurements,undefined);assert.equal(observed.records[0].notes,'Synthetic multiline\nevidence');
 });
 await check('authorized POST preview renders report without creating a record; denied preview has no controls or loading',async()=>{
  assert.equal(await denied.getByRole('button',{name:'Resolve values',exact:true}).count(),0);assert.equal(await denied.getByText('Loading records…',{exact:true}).count(),0);await preview.getByLabel('Preview amount',{exact:true}).fill('12.34');await preview.getByRole('button',{name:'Resolve values',exact:true}).click();await preview.getByRole('heading',{name:'Resolved synthetic values',exact:true}).waitFor();assert.match(await preview.innerText(),/12\.34/);const observed=await(await context.request.get(origin+'/api/fixture/observed')).json();assert.equal(observed.records.length,1);assert.equal(observed.calls.filter(c=>c.path.endsWith('/preview')).length,1);assert.equal(observed.calls.at(-1).body.amount,1234);const path='artifacts/phase15a-module-forms-preview.png';await page.screenshot({path,fullPage:true});report.screenshots.push(path);
 });
 await check('failed preview displays an accessible error and retains form values for reviewed retry',async()=>{
  await context.request.post(origin+'/api/fixture/fail-next-preview');await preview.getByRole('button',{name:'Resolve values',exact:true}).click();await preview.getByRole('alert').filter({hasText:'Synthetic preview unavailable; retry after review.'}).waitFor();assert.equal(await preview.getByRole('heading',{name:'Resolved synthetic values',exact:true}).count(),0);assert.equal(await preview.getByLabel('Preview amount',{exact:true}).inputValue(),'12.34');assert.equal(await preview.getByRole('button',{name:'Resolve values',exact:true}).isEnabled(),true);assert.deepEqual(pageErrors,[]);const path='artifacts/phase15a-module-forms-preview-error.png';await page.screenshot({path,fullPage:true});report.screenshots.push(path);
 });
}finally{
 try{if(browser)await browser.close();}finally{if(server)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));report.finishedAt=new Date().toISOString();report.pageErrors=pageErrors;report.status=report.checks.length===4&&report.checks.every(c=>c.status==='passed')?'passed':'failed';await writeFile('artifacts/phase15a-module-forms-browser.json',JSON.stringify(report,null,2)+'\n');}
}
