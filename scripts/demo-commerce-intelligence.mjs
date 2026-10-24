// Controlled, repeatable simulator scenario. Never accepts a live commerce connection.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {request} from 'node:https';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {directory,compose,docker} from './lib.mjs';
import {moduleNavigation,openWorkspace} from './ui-navigation.mjs';
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');
const {api,logins,login,credentials,sessions,origin,deployment,waitFor}=await import('./phase4-client.mjs');
const {mcp}=await import('./mcp-client.mjs');
const action=process.argv[3]??'verify';
assert(['seed','verify','browser'].includes(action),'Use seed|verify|browser');
const commerce=JSON.parse(await readFile(path.join(directory,'commerce/manifest.json'),'utf8'));
assert.equal(commerce.simulators,true,'This scenario requires explicitly provisioned simulators');
const settings={};for(const provider of ['shopify','printify'])settings[provider]=JSON.parse(await readFile(path.join(directory,'commerce/private',provider,'config.json'),'utf8'));
const ca=await readFile(path.join(directory,'security/ca-cert.pem'));
const report={version:1,startedAt:new Date().toISOString(),simulation:true,checks:[],scenarios:[],browserErrors:[]};
const pass=(name,details={})=>{report.checks.push({name,...details});console.log('PASS '+name);};
const endpoint=(key,module,url,method='GET',body,status=200)=>api(key,`/api/v3/modules/cee.${module}/api${url}`,method,body,status).then(r=>r.value);
async function list(key,module,resource){const all=[];for(let offset=0;;){const page=await endpoint(key,module,`/${resource}?limit=20&offset=${offset}`);all.push(...page.records);if(page.nextOffset===null||page.nextOffset===undefined)return all;offset=page.nextOffset;}}
const act=(key,module,name,row)=>endpoint(key,module,`/${name}/${row.id}`,'POST',{revision:row.revision,requestId:randomUUID()});
async function control(provider,key,body){
 const cfg=settings[provider],index=Number(key.split('-')[1])-1;
 return new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port:commerce.ports[provider],path:'/__sim/control',method:'POST',ca,servername:provider+'-simulator',timeout:10000,headers:{authorization:'Bearer '+cfg.adminToken,'content-type':'application/json'}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>{try{assert.equal(res.statusCode,200,'Simulator control failed');resolve(JSON.parse(text));}catch(e){reject(e);}});});req.on('error',reject);req.on('timeout',()=>req.destroy());req.end(JSON.stringify({shopId:cfg.accounts[index].shopId,...body}));});
}
const cents=n=>(n/100).toFixed(2),money=n=>({shopMoney:{amount:cents(n),currencyCode:'USD'}});
const scenarios=[
 {key:'worker-1',id:910001,sku:'SYN-10-PREMIUM',quantity:3,price:3500,discount:1500,cost:800,shipping:200,fee:200,refund:500},
 {key:'worker-1',id:910002,sku:'SYN-10-LOW',quantity:2,price:1500,discount:0,cost:1200,shipping:200,fee:100,refund:0},
 {key:'worker-3',id:910003,sku:'SYN-10-PREMIUM',quantity:2,price:3500,discount:0,cost:1600,shipping:300,fee:150,refund:0},
 {key:'worker-1',id:910005,sku:'SYN-10-WAITING',quantity:1,price:2500,discount:0,cost:1000,shipping:200,fee:null,refund:0,awaiting:true},
 {key:'worker-1',id:910004,sku:'SYN-10-CANCELED',quantity:1,price:2000,discount:0,cost:1000,shipping:200,fee:null,refund:0,canceled:true}
];
function fixture(s){const id='gid://shopify/Order/'+s.id,line='gid://shopify/LineItem/'+s.id,variant='gid://shopify/ProductVariant/'+s.id;return{id,name:'SYN-10-'+s.id,createdAt:'2026-10-20T12:00:00.000Z',updatedAt:new Date().toISOString(),currencyCode:'USD',displayFinancialStatus:'PAID',displayFulfillmentStatus:'UNFULFILLED',cancelledAt:s.canceled?'2026-10-20T13:00:00.000Z':null,totalRefundedSet:money(0),lineItems:{nodes:[{id:line,sku:s.sku,quantity:s.quantity,originalUnitPriceSet:money(s.price),discountedTotalSet:money(s.price*s.quantity-s.discount),variant:{id:variant}}],pageInfo:{hasNextPage:false}},fulfillmentOrders:{nodes:[{id:'gid://shopify/FulfillmentOrder/'+s.id,status:'OPEN',lineItems:{nodes:[{id:'gid://shopify/FulfillmentOrderLineItem/'+s.id,remainingQuantity:s.quantity,lineItem:{id:line,sku:s.sku}}]}}]},fulfillments:[]};}
async function seed(){
 for(const key of ['worker-1','worker-3']){
  const installed=(await api(key,'/api/v3/modules')).value.installed;
  for(const id of ['sales','shopify','printify']){const module=installed.find(m=>m.moduleId==='cee.'+id);assert.equal(module?.state,'active',key+' requires active '+id);assert.equal(module.configuration.currency,'USD','Do not modify historical currency configuration');if(id!=='sales'&&!module.configuration.publishOperationalAlerts)await api(key,`/api/v3/modules/cee.${id}/configuration`,'PUT',{configuration:{...module.configuration,publishOperationalAlerts:true}});}
 }
 for(const s of scenarios){
  const {key}=s,variant='gid://shopify/ProductVariant/'+s.id;
  await control('shopify',key,{action:'seed',products:[{id:'gid://shopify/Product/'+s.id,title:s.sku,status:'ACTIVE',updatedAt:new Date().toISOString(),variants:{nodes:[{id:variant,sku:s.sku,inventoryQuantity:50}],pageInfo:{hasNextPage:false}}}],orders:[fixture(s)]});
  await control('printify',key,{action:'seed',products:[{id:'syn-10-product-'+s.id,title:s.sku,blueprint_id:1,print_provider_id:9,variants:[{id:s.id,is_enabled:true,is_available:true,cost:s.cost,shipping_cost:s.shipping,sku:s.sku}]}],orders:[]});
  await waitFor(async()=>(await list(key,'shopify','catalog')).some(p=>p.variants.some(v=>v.sourceVariantId===variant))&&(await list(key,'printify','catalog')).some(p=>p.sourceId==='syn-10-product-'+s.id),'source catalog '+s.id);
  if(!(await list(key,'shopify','mappings')).some(m=>m.sourceVariantId===variant))await endpoint(key,'shopify','/mappings','POST',{sourceVariantId:variant,sku:s.sku},201);
  if(!(await list(key,'printify','mappings')).some(m=>m.sku===s.sku))await endpoint(key,'printify','/mappings','POST',{sku:s.sku,productId:'syn-10-product-'+s.id,variantId:s.id},201);
  if(!(await list(key,'inventory','items')).some(i=>i.sku===s.sku))await endpoint(key,'inventory','/items','POST',{sku:s.sku,name:s.sku,quantity:50},201);
  let sale=(await list(key,'sales','orders')).find(o=>o.sourceId==='gid://shopify/Order/'+s.id);
  if(!sale){const channel=await waitFor(async()=>(await list(key,'shopify','orders')).find(o=>o.sourceId==='gid://shopify/Order/'+s.id),'source order');await act(key,'shopify','dispatch',channel);sale=await waitFor(async()=>(await list(key,'sales','orders')).find(o=>o.sourceId==='gid://shopify/Order/'+s.id),'governed import');}
  if(!s.canceled&&!s.awaiting){
   if(sale.status==='draft')await act(key,'sales','confirm',sale);
   sale=await waitFor(async()=>{const r=(await list(key,'sales','orders')).find(o=>o.id===sale.id);return r.stockStatus==='reserved'||r.status==='fulfilled'?r:false;},'reserved stock');
   if(!sale.productionRequested)await act(key,'sales','production',sale);
   let job=await waitFor(async()=>(await list(key,'printify','jobs')).find(j=>j.orderId===sale.id),'production intent');
   if(job.status==='awaiting_authorization')await act(key,'printify','authorize',job);
   const remote=await waitFor(async()=>(await control('printify',key,{action:'snapshot'})).orders.find(o=>o.external_id.endsWith(sale.id)&&['in-production','fulfilled'].includes(o.status)),'simulated production');
   if(remote.status!=='fulfilled')await control('printify',key,{action:'update',kind:'orders',id:remote.id,patch:{status:'fulfilled',shipments:[{number:'SYN-10-TRACK-'+s.id}]}});
   sale=await waitFor(async()=>{const r=(await list(key,'sales','orders')).find(o=>o.id===sale.id);return r.status==='fulfilled'&&r.remoteFulfillmentStatus==='FULFILLED'?r:false;},'completed shipment and channel receipt');
   if(s.refund&&sale.refundCents!==s.refund){await control('shopify',key,{action:'update',kind:'orders',id:sale.sourceId,patch:{displayFinancialStatus:'PARTIALLY_REFUNDED',totalRefundedSet:money(s.refund),updatedAt:new Date().toISOString()}});sale=await waitFor(async()=>{const r=(await list(key,'sales','orders')).find(o=>o.id===sale.id);return r.refundCents===s.refund?r:false;},'source refund');}
   const assessment={orderNumber:sale.number,currency:'USD',productionAmount:cents(s.cost*s.quantity),shippingAmount:cents(s.shipping*s.quantity),transactionFeeAmount:cents(s.fee),channelFeeAmount:'0.00',basis:'estimated',reference:'Synthetic Phase 10A supplier quotes and fee schedule; not settlement evidence'};
   if(!(await list(key,'sales','financial-assessments')).some(a=>a.orderNumber===sale.number))await endpoint(key,'sales','/financial-assessments','POST',assessment,201);
  }
  if(s.awaiting){if(sale.status==='draft')await act(key,'sales','confirm',sale);sale=await waitFor(async()=>{const r=(await list(key,'sales','orders')).find(o=>o.id===sale.id);return r.stockStatus==='reserved'?r:false;},'pending approval reservation');if(!sale.productionRequested)await act(key,'sales','production',sale);await waitFor(async()=>(await list(key,'printify','jobs')).some(j=>j.orderId===sale.id&&j.status==='awaiting_authorization'),'unapproved production hold');}
  sale=(await list(key,'sales','orders')).find(o=>o.id===sale.id);if(!sale.commerceApproved)await act(key,'sales','publish-commerce',sale);
  report.scenarios.push({worker:key,recordId:sale.id,sourceId:sale.sourceId,sku:s.sku,currency:'USD',expectedContributionCents:(s.canceled||s.awaiting)?null:s.price*s.quantity-s.discount-s.refund-s.cost*s.quantity-s.shipping*s.quantity-s.fee});
 }
 // Paid source order deliberately has no mapping, no dispatch and no manufacturing authority.
 const unowned={...scenarios[0],id:910099,sku:'SYN-10-UNOWNED',refund:0,canceled:false};await control('shopify','worker-1',{action:'seed',products:[],orders:[fixture(unowned)]});
 pass('repeatable USD scenario seeded through authenticated simulators and approved module workflows',{orders:report.scenarios});
}
async function verify(){
 let evidence=await waitFor(async()=>{const rows=(await api('master','/api/v4/analytics')).value.records.filter(r=>r.stream_id==='commerce_orders'&&scenarios.some(s=>r.payload.projection.sourceId==='gid://shopify/Order/'+s.id));return rows.length===scenarios.length?rows:false;},'governed synchronization');
 for(const s of scenarios){const result=await endpoint(s.key,'sales','/commerce-intelligence'),order=result.records.find(o=>o.sourceId.endsWith('/'+s.id));assert.ok(order);const expected=(s.canceled||s.awaiting)?null:s.price*s.quantity-s.discount-s.refund-s.cost*s.quantity-s.shipping*s.quantity-s.fee;assert.equal(order.contributionMarginCents,expected);assert.equal(order.marginBasis,(s.canceled||s.awaiting)?'incomplete':'estimated');}
 const rows=(await api('master','/api/v4/analytics')).value.entities;
 for(const key of ['worker-1','worker-3']){const entityId=(await api(key,'/api/v2/worker/status')).value.entityId;await api('master','/api/v4/commerce-monitor','PUT',{entityId,enabled:true});}
 const conditions=await waitFor(async()=>{const v=(await api('master','/api/v4/commerce-monitor')).value;return v.conditions.some(c=>c.code==='low_contribution_margin')&&v.conditions.some(c=>c.code==='fulfillment_owner_unknown')?v:false;},'authorized exception alerts');
 const count=(await api('master','/api/v4/findings')).value.findings.length;
 for(const key of ['worker-1','worker-3']){const entityId=(await api(key,'/api/v2/worker/status')).value.entityId;await api('master','/api/v4/commerce-monitor','PUT',{entityId,enabled:true});}
 assert.equal((await api('master','/api/v4/findings')).value.findings.length,count,'Unchanged policy replay must not duplicate alerts');
 const low=conditions.conditions.find(c=>c.code==='low_contribution_margin');
 const lowOrder=(await list('worker-1','sales','orders')).find(o=>o.id===low.record_id),assessment=(await list('worker-1','sales','financial-assessments')).find(a=>a.orderNumber===lowOrder.number);assert(assessment);const body={...assessment};delete body.id;await endpoint('worker-1','sales','/financial-assessments/'+assessment.id,'PUT',body);
 await waitFor(async()=>(await api('master','/api/v4/analytics')).value.records.some(r=>r.record_id===low.record_id&&r.stream_id==='commerce_orders'&&Number(r.revision)>Number(low.source_revision)),'newer source revision without a new alert');
 const originalEvidence=(await api('master','/api/v4/findings/'+low.finding_id+'/evidence')).value;assert(originalEvidence.evidence.every(e=>e.available&&e.observedAt&&e.payload));const currentLow=(await api('master','/api/v4/analytics')).value.records.find(r=>r.record_id===low.record_id&&r.stream_id==='commerce_orders');assert(originalEvidence.evidence.every(e=>Number(e.reference.revision)<Number(currentLow.revision)));assert.equal((await api('master','/api/v4/findings')).value.findings.length,count);
 const delivered=await waitFor(async()=>(await api('worker-1','/api/v4/findings')).value.findings.find(f=>f.finding_id===low.finding_id),'affected Worker delivery');
 assert(!(await api('worker-2','/api/v4/findings')).value.findings.some(f=>f.finding_id===low.finding_id));assert(!(await api('worker-3','/api/v4/findings')).value.findings.some(f=>f.finding_id===low.finding_id));
 if(delivered.status!=='acknowledged'&&delivered.status!=='resolved')await api('worker-1','/api/v4/findings/'+low.finding_id,'PUT',{revision:delivered.revision,status:'acknowledged'});
 await waitFor(async()=>(await api('master','/api/v4/findings')).value.receipts.some(r=>r.finding_id===low.finding_id&&['acknowledged','resolved'].includes(r.status)),'durable acknowledgment');
 evidence=(await api('master','/api/v4/analytics')).value.records.filter(r=>r.stream_id==='commerce_orders'&&scenarios.some(s=>r.payload.projection.sourceId==='gid://shopify/Order/'+s.id));
 pass('exact USD contribution, estimates, cancel/refund evidence, deduplicated affected-only alert and acknowledgment',{sources:evidence.map(r=>({recordId:r.record_id,revision:r.revision})),historicalEvidence:originalEvidence,conditions:conditions.conditions});
 const clients=[];
 try{
  const c=await mcp('master');clients.push(c);const call=(name,args={})=>c.callTool({name,arguments:args},{timeout:15000});const tools=(await c.listTools()).tools.map(t=>t.name);for(const tool of ['query_commerce_exceptions','query_commerce_demand_trends','analyze_commerce_by_id'])assert(tools.includes(tool));
  const refs=evidence.filter(r=>r.payload.projection.status==='fulfilled').map(r=>({recordId:r.record_id,revision:Number(r.revision)}));const result=await call('analyze_commerce_by_id',{sources:refs});assert(!result.isError);const calculations=result.structuredContent.data.calculation.contributionAnalysis;assert.deepEqual(calculations.map(c=>c.contributionMarginCents).sort((a,b)=>a-b),[100,5300,3050].sort((a,b)=>a-b));
  const exceptions=await call('query_commerce_exceptions',{limit:20});assert(!exceptions.isError);assert(exceptions.structuredContent.data.records.some(r=>r.code==='fulfillment_owner_unknown'));
  const trends=await call('query_commerce_demand_trends',{from:'2026-10-01T00:00:00Z',split:'2026-10-15T00:00:00Z',to:'2026-11-01T00:00:00Z',limit:20});assert(!trends.isError);assert(trends.structuredContent.data.supplierCostComparisons.some(c=>c.sku==='SYN-10-PREMIUM'&&Math.abs(c.differenceCentsPerOrderedUnit.exactCents)===800));
  const original=sessions.master;await login('master',credentials.accounts.enroller);const scoped=await mcp('master');clients.push(scoped);const visible=await scoped.callTool({name:'query_commerce_exceptions',arguments:{limit:20}});assert(visible.structuredContent.data.records.every(r=>r.entityId===credentials.entityA));const foreign=evidence.find(r=>r.entity_id!==credentials.entityA);assert((await scoped.callTool({name:'analyze_commerce_by_id',arguments:{sources:[{recordId:foreign.record_id,revision:Number(foreign.revision)}]}})).isError);await api('master','/api/v4/commerce-monitor','PUT',{entityId:credentials.entityA,enabled:true},403);const foreignCondition=conditions.conditions.find(c=>c.entity_id!==credentials.entityA);if(foreignCondition)await api('master','/api/v4/findings/'+foreignCondition.finding_id+'/evidence','GET',undefined,404);sessions.master=original;
  pass('live authorized MCP discovery, exact contribution, exception screening, demand windows and foreign-entity rejection',{calculation:result.structuredContent.data,exceptions:exceptions.structuredContent.data,trends:trends.structuredContent.data});
 }finally{for(const c of clients)await c.close();}
}
async function browserChecks(){
 const {chromium}=await import('playwright'),browser=await chromium.launch({headless:true});
 try{
  for(const key of ['worker-1','master']){
   const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});await context.addCookies([{name:'__Host-steward',value:sessions[key].cookie.split('=')[1],url:origin(key),secure:true,httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage();page.on('pageerror',e=>report.browserErrors.push(e.message));page.setDefaultTimeout(45000);await page.goto(origin(key));
   if(key==='worker-1'){
    await page.goto(origin(key)+'/#/business/module/cee.sales/commerce-intelligence');await page.getByRole('heading',{name:'USD · Commerce overview',exact:true}).waitFor();await page.getByText('Contribution margin · incomplete',{exact:true}).waitFor();assert((await page.locator('body').innerText()).includes('$53.00'));assert(await page.locator('.module-table tbody tr').evaluateAll(rows=>rows.every(r=>r.getBoundingClientRect().height<240)),'Module rows must remain readable without expanded long descriptions');await page.screenshot({path:'artifacts/phase10a-worker-dashboard.png',fullPage:true});
    await page.getByLabel('From (local time)').fill('2026-10-01T00:00');await page.getByLabel('To (exclusive, local time)').fill('2026-11-01T00:00');await page.getByRole('button',{name:'Apply reporting period'}).click();await page.getByRole('heading',{name:'USD · Commerce overview',exact:true}).waitFor();
    await page.goto(origin(key)+'/#/business/module/cee.shopify/commerce-exceptions');await page.getByText('Paid order has no confirmed fulfillment owner. Explicit ownership review is required.',{exact:true}).waitFor();await page.screenshot({path:'artifacts/phase10a-worker-exceptions.png',fullPage:true});
   }else{
    await page.goto(origin(key)+'/#/business/reports');await page.getByRole('heading',{name:'Financial & operational reporting',exact:true}).waitFor();await page.getByRole('heading',{name:'Commerce exception monitoring',exact:true}).waitFor();await page.getByText('Contribution margin, fees and missing-cost evidence',{exact:true}).first().click();await page.screenshot({path:'artifacts/phase10a-master-report.png',fullPage:true});const monitor=(await api('master','/api/v4/commerce-monitor')).value;const low=monitor.conditions.find(c=>c.code==='low_contribution_margin');await page.goto(origin(key)+'/#/business/findings/'+low.finding_id);await page.getByRole('button',{name:'Load original commerce evidence',exact:true}).click();await page.getByText('Retained source snapshot at alert creation',{exact:true}).waitFor();await page.screenshot({path:'artifacts/phase10a-master-finding-evidence.png',fullPage:true});
   }
   await context.close();
  }
  assert.deepEqual(report.browserErrors,[]);pass('Chromium Business workspace dashboards, period controls, exception presentation and Master evidence reports');
 }finally{await browser.close();}
}
await mkdir('artifacts',{recursive:true});
try{await logins();if(action==='seed')await seed();else if(action==='verify')await verify();else await browserChecks();report.status='passed';}catch(e){report.status='failed';report.error=e.message;throw e;}finally{report.finishedAt=new Date().toISOString();await writeFile('artifacts/phase10a-demo-'+action+'.json',JSON.stringify(report,null,2)+'\n');}
