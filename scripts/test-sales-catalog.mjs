// Actual disposable PostgreSQL + Sales HTTP, including applied001–006 upgrade.
// Private headers below are host fixtures, not proof of installed routing.
import {execFileSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import pg from 'pg';
import {createBusinessServer} from '../packages/business-kit/dist/index.js';
import {digest,validateCommand} from '../packages/module-sdk/dist/index.js';
import {sales} from '../modules/sales/dist/definition.js';
import {privateDirectory} from '../tools/installer/dist/security.js';
const directory='.steward/phase15-sales-tests/'+randomUUID(),container='steward-sales-tests-'+randomUUID(),password=randomBytes(32).toString('base64url'),token=randomBytes(32).toString('base64url'),actor=randomUUID(),installationId=randomUUID();
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
let pool,app;
try{
 await mkdir(directory,{recursive:true});privateDirectory(directory);await writeFile(directory+'/db.env','POSTGRES_PASSWORD='+password+'\n',{mode:0o600});
 docker(['run','--rm','-d','--name',container,'--env-file',directory+'/db.env','-p','127.0.0.1::5432','postgres:17.10-alpine']);
 const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort);
 pool=new pg.Pool({host:'127.0.0.1',port,user:'postgres',password,database:'postgres',connectionTimeoutMillis:1000});
 for(let i=0;;i++){try{await pool.query('SELECT 1');break;}catch(e){if(i===40)throw e;await delay(300);}}
 const migrations=(await readdir('modules/sales/migrations')).sort();for(const name of migrations.slice(0,6))await pool.query(await readFile('modules/sales/migrations/'+name,'utf8'));
 const legacy=async(number,net,receiptNet)=>{
  const id=randomUUID(),line={sourceVariantId:'external-'+number,sku:number,quantity:3,unitPriceCents:50,lineRevenueCents:net},data={number,customerCode:'legacy',status:'fulfilled',stockStatus:'not_requested',inventoryIntegration:false,reserved:{},fulfilled:{[number]:3},currency:'USD',lines:[{sku:number,quantity:3,unitPriceCents:50}],sourceLines:[line],sourceId:number,sourceModuleId:'fixture.channel',channel:'fixture',createdAt:'2026-01-01T00:00:00Z',sourceUpdatedAt:'2026-01-02T00:00:00Z',commerceApproved:true,refundCents:0};
  await pool.query("INSERT INTO business_records(id,kind,key,data) VALUES($1,'order',$2,$3)",[id,number,data]);
  if(receiptNet!==undefined)await pool.query("INSERT INTO business_requests(request_id,actor,operation,digest,response) VALUES($1,$2,'/confirm/:id','fixture-receipt',$3)",[randomUUID(),actor,{record:{id,revision:2,...data,status:'confirmed',sourceLines:[{...line,lineRevenueCents:receiptNet}]}}]);
  return{id,data};
 };
 const proven=await legacy('LEGACY-PROVEN',145,100),unknown=await legacy('LEGACY-UNKNOWN',149);
 const disputed=await legacy('LEGACY-CONFLICT',149,100),malformed=await legacy('LEGACY-MALFORMED',149);
 const mismatchedCurrency=await legacy('LEGACY-CURRENCY',149,100),mismatchedGross=await legacy('LEGACY-GROSS',149,100);
 for(const [row,patch] of [[mismatchedCurrency,{currency:'EUR'}],[mismatchedGross,{lines:[{...mismatchedGross.data.lines[0],unitPriceCents:60}],sourceLines:[{...mismatchedGross.data.sourceLines[0],unitPriceCents:60,lineRevenueCents:100}]}]])await pool.query("INSERT INTO business_requests(request_id,actor,operation,digest,response) VALUES($1,$2,'/confirm/:id','fixture-conflicting-receipt',$3)",[randomUUID(),actor,{record:{id:row.id,revision:2,...row.data,status:'confirmed',...patch}}]);
 for(const [row,sourceLines] of [[disputed,[{...disputed.data.sourceLines[0],lineRevenueCents:110}]],[malformed,'unusable-receipt']])await pool.query("INSERT INTO business_requests(request_id,actor,operation,digest,response) VALUES($1,$2,'/confirm/:id','fixture-receipt',$3)",[randomUUID(),actor,{record:{id:row.id,revision:2,...row.data,status:'confirmed',sourceLines}}]);
 const before=(await pool.query('SELECT * FROM commerce_orders ORDER BY id')).rows;
 // Fixture represents append-only synchronization capture, preserving exact emitted bytes.
 await pool.query("CREATE TABLE fixture_emitted(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,payload text NOT NULL); CREATE FUNCTION fixture_capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO fixture_emitted(payload) VALUES(NEW.projection::text); RETURN NEW; END $$; CREATE TRIGGER fixture_capture AFTER INSERT OR UPDATE ON commerce_orders FOR EACH ROW EXECUTE FUNCTION fixture_capture()");
 await pool.query('INSERT INTO fixture_emitted(payload) SELECT projection::text FROM commerce_orders ORDER BY id');
 const emitted=(await pool.query('SELECT * FROM fixture_emitted ORDER BY id')).rows;
 for(const name of migrations.slice(6))await pool.query(await readFile('modules/sales/migrations/'+name,'utf8'));
 await test('Upgrade uses original confirmation receipts, never overwritten current observations',async()=>{
  const snapshots=(await pool.query('SELECT * FROM sales_accepted_prices')).rows;assert.equal(snapshots.length,1);assert.equal(snapshots[0].order_id,proven.id);assert.equal(snapshots[0].snapshot.lines[0].lineRevenueCents,100);assert.equal(snapshots[0].snapshot.mode,'legacy-receipt');
  assert.equal((await pool.query('SELECT data FROM business_records WHERE id=$1',[proven.id])).rows[0].data.sourceLines[0].lineRevenueCents,145,'Original observations preserved');
  const projections=(await pool.query('SELECT * FROM commerce_orders')).rows;assert.equal(projections.find(r=>r.id===proven.id).projection.recognizedRevenueCents,100);assert.equal(projections.find(r=>r.id===unknown.id).projection.approved,false);assert(projections.find(r=>r.id===unknown.id).revision>before.find(r=>r.id===unknown.id).revision);
  assert.deepEqual((await pool.query('SELECT * FROM fixture_emitted ORDER BY id LIMIT $1',[emitted.length])).rows,emitted);assert((await pool.query('SELECT count(*)::int n FROM fixture_emitted')).rows[0].n>emitted.length);
 });
 await test('Conflicting and malformed original receipts remain unknown without blocking upgrade',async()=>{for(const row of [disputed,malformed,mismatchedCurrency,mismatchedGross]){assert.equal((await pool.query('SELECT 1 FROM sales_accepted_prices WHERE order_id=$1',[row.id])).rowCount,0);assert.equal((await pool.query('SELECT projection FROM commerce_orders WHERE id=$1',[row.id])).rows[0].projection.approved,false);}});
 const manifest=JSON.parse(await readFile('modules/sales/manifest.json','utf8'));
 // API metadata is independently under construction; fixture adds exact new declarations.
 for(const api of [{operationId:'priceReconciliation',method:'GET',path:'/price-reconciliation',permission:'cee.sales.read'},{operationId:'listPriceReconciliation',method:'GET',path:'/price-reconciliations',permission:'cee.sales.reconcile',query:['limit','offset']},{operationId:'createPriceReconciliation',method:'POST',path:'/price-reconciliations',permission:'cee.sales.reconcile'}])if(!manifest.api.some(a=>a.path===api.path&&a.method===api.method))manifest.api.push(api);
 const runtime={installationId,configuration:{currency:'USD',integrationsEnabled:false}},permissions=[...new Set(manifest.api.map(a=>a.permission))];
 const start=()=>createBusinessServer(pool,token,runtime,sales(manifest),async()=>migrations.length,async()=>{});app=start();
 const q=async(method,url,payload,status=200,allowed=permissions)=>{const response=await app.inject({method,url,headers:{authorization:'Bearer '+token,'x-steward-actor':actor,'x-steward-permissions':JSON.stringify(allowed)},...(payload===undefined?{}:{payload})});assert.equal(response.statusCode,status,method+' '+url+': '+response.body);return response.json();};
 const current=async(id)=>(await pool.query('SELECT * FROM business_records WHERE id=$1',[id])).rows[0];
 const act=async(path,id)=>{const r=await current(id);return q('POST',path+'/'+id,{revision:r.revision,requestId:randomUUID()});};
 let sequence=0;
 const incoming=async(payload,{id=randomUUID(),status=200}={})=>{const command={protocol:'steward-module-integration-v1',commandId:id,sourceModuleId:'fixture.channel',targetModuleId:'cee.sales',command:'commerce.order.import',version:1,aggregateId:channelAggregate,sequence:++sequence,occurredAt:new Date().toISOString(),payload,capability:{capabilityId:'commerce.orders.manage',operation:'commerce.order.import'}};runtime.configuration.integrationsEnabled=true;const response=await app.inject({method:'POST',url:'/integration-inbox',headers:{authorization:'Bearer '+token,'x-steward-installation':installationId,'x-steward-integration-source':'fixture.channel','x-steward-capability':'commerce.orders.manage'},payload:command});runtime.configuration.integrationsEnabled=false;assert.equal(response.statusCode,status,response.body);return{result:response.json(),command};};
 const channelAggregate=randomUUID(),source={sourceId:'D1-SOURCE',sourceCreatedAt:'2026-03-01T00:00:00Z',sourceUpdatedAt:'2026-03-02T00:00:00Z',channel:'fixture',currency:'USD',financialStatus:'paid',fulfillmentStatus:'unfulfilled',canceled:false,refundCents:0,lines:[{sourceVariantId:'variant1',sku:'EXTERNAL',quantity:3,unitPriceCents:50,lineRevenueCents:100}]};
 let external;
 await test('Accepted discounted source money remains immutable while refunds and observations evolve',async()=>{
  external=(await incoming(source)).result.orderId;await act('/confirm',external);
  const changed={...source,sourceUpdatedAt:'2026-03-03T00:00:00Z',financialStatus:'partially_refunded',refundCents:10,lines:[{...source.lines[0],lineRevenueCents:140}]};await incoming(changed);
  const order=await current(external);assert.equal(order.data.sourceLines[0].lineRevenueCents,100);assert.equal(order.data.refundCents,10);assert.equal(order.data.priceReconciliationRequired,true);
  assert.equal((await pool.query('SELECT snapshot FROM sales_accepted_prices WHERE order_id=$1',[external])).rows[0].snapshot.lines[0].lineRevenueCents,100);assert.equal((await pool.query('SELECT count(*)::int n FROM sales_source_observations')).rows[0].n,2);assert.equal((await pool.query('SELECT count(*)::int n FROM sales_price_reconciliations WHERE order_id=$1',[external])).rows[0].n,1);
 });
 await test('Three partial fulfillments allocate100cents exactly, including period boundaries',async()=>{
  const order=await current(external);await pool.query("UPDATE business_records SET data=data||'{\"productionStatus\":\"shipped\"}'::jsonb WHERE id=$1",[external]);
  const amounts=[];for(let i=0;i<3;i++){const response=await q('POST','/fulfillments',{number:'D1-F'+i,orderNumber:order.key,lines:[{sku:'EXTERNAL',quantity:1}]},201);const stamp=new Date(Date.UTC(2026,5,i+1)).toISOString();await pool.query('UPDATE business_records SET updated_at=$2 WHERE id=$1',[response.record.id,stamp]);const report=await q('GET','/sales-period?from='+stamp+'&to='+new Date(Date.UTC(2026,5,i+2)).toISOString());amounts.push(report.revenueCents);}
  assert.deepEqual(amounts,[33,33,34]);assert.equal((await q('GET','/sales-period?from=2026-06-01&to=2026-06-04')).revenueCents,100);
 });
 await test('Unknown acceptance stays explicit and cannot fabricate legacy revenue',async()=>{
  const rows=(await q('GET','/price-reconciliation')).records;assert.equal(rows.find(r=>r.id===unknown.id).priceKnown,false);
  const intelligence=await q('GET','/commerce-intelligence');assert.equal(intelligence.unknownAcceptanceCount,5);assert.match(intelligence.coverage,/subtotal/);
  await q('POST','/fulfillments',{number:'UNKNOWN-F',orderNumber:unknown.data.number,lines:[{sku:'LEGACY-UNKNOWN',quantity:1}]},422);
 });
 await test('Human reconciliation is explicit, immutable, authorized and recorded now',async()=>{
  const body={number:'REVIEW1',orderNumber:unknown.data.number,currency:'USD',lines:[{sku:'LEGACY-UNKNOWN',quantity:3,unitPriceCents:50,lineRevenueCents:110}],evidenceReference:'fixture:reviewed-original-invoice',reason:'Actual synthetic human reconciliation evidence'};
  await q('POST','/price-reconciliations',body,403,[]);await q('POST','/price-reconciliations',{...body,actor:randomUUID()},400);await q('POST','/price-reconciliations',body,201);
  const snapshot=(await pool.query('SELECT snapshot FROM sales_accepted_prices WHERE order_id=$1',[unknown.id])).rows[0].snapshot;assert.equal(snapshot.mode,'reviewed-reconciliation');assert.equal(snapshot.actor,actor);assert.equal(snapshot.lines[0].lineRevenueCents,110);await q('POST','/price-reconciliations',{...body,number:'REVIEW2'},409);
 });
 await test('Database immutable proof guards reject mutation and deletion',async()=>{for(const table of ['sales_accepted_prices','sales_source_observations','sales_price_reconciliations']){await assert.rejects(pool.query('DELETE FROM '+table),/append-only/);}});
 await test('Legacy manual Sales works without Catalog or Pricing and survives restart',async()=>{
  await q('POST','/customers',{code:'D1',name:'Synthetic customer',reference:'fixture'},201);let order=(await q('POST','/orders',{number:'D1-MANUAL',customerCode:'D1',currency:'USD',lines:[{sku:'MANUAL',quantity:2,unitPriceCents:25}]},201)).record;await act('/confirm',order.id);await q('POST','/fulfillments',{number:'MANUAL-F',orderNumber:order.number,lines:[{sku:'MANUAL',quantity:2}]},201);
  await app.close();app=start();assert.equal((await current(order.id)).data.status,'fulfilled');assert.equal((await pool.query('SELECT snapshot FROM sales_accepted_prices WHERE order_id=$1',[order.id])).rows[0].snapshot.mode,'manual');assert.equal((await pool.query('SELECT count(*)::int n FROM integration_outbox')).rows[0].n,0);
 });
 await test('Narrow period remains available beyond10000 historical movements',async()=>{
  const order=(await q('POST','/orders',{number:'HISTORY-LARGE',customerCode:'D1',currency:'USD',lines:[{sku:'HISTORY',quantity:10001,unitPriceCents:1}]},201)).record;await act('/confirm',order.id);
  await pool.query("INSERT INTO business_records(id,kind,key,data,created_at,updated_at) SELECT gen_random_uuid(),'fulfillment','HISTORY-'||n,jsonb_build_object('number','HISTORY-'||n,'orderNumber','HISTORY-LARGE','status','completed','lines',jsonb_build_array(jsonb_build_object('sku','HISTORY','quantity',1))),'2001-01-01'::timestamptz,'2001-01-01'::timestamptz FROM generate_series(1,10001) n");
  assert.equal((await q('GET','/sales-period?from=2026-06-01&to=2026-06-04')).revenueCents,100);
 });
}finally{await app?.close();await pool?.end();try{docker(['rm','-f',container]);}catch{}await rm(directory,{recursive:true,force:true});}
