// Disposable, isolated PostgreSQL fixture. Existing Steward deployments are untouched.
import {execFileSync} from 'node:child_process';
import {writeFile,mkdir,rm,readFile,readdir} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {privateDirectory} from '../tools/installer/dist/security.js';
import pg from 'pg';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createBusinessServer} from '../packages/business-kit/dist/index.js';
import {digest,canonical,validateManifest,authorizeCommand} from '../packages/module-sdk/dist/index.js';
import {createInventoryServer} from '../modules/inventory/dist/server.js';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('..',import.meta.url)));
const directory='.steward/phase7-database-tests',container='steward-business-tests-'+randomUUID();
await mkdir(directory,{recursive:true});privateDirectory(directory);
const secretFile=directory+'/postgres.env',password=randomBytes(32).toString('base64url');
await writeFile(secretFile,'POSTGRES_PASSWORD='+password+'\n',{mode:0o600});
const docker=(args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const pools=[],apps=[];
let admin;
try{
 docker(['run','--rm','-d','--name',container,'--env-file',secretFile,'-p','127.0.0.1::5432','postgres:17.10-alpine']);
 const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort);
 admin=new pg.Pool({host:'127.0.0.1',port,user:'postgres',password,database:'postgres',connectionTimeoutMillis:1000});
 for(let n=0;;n++){try{await admin.query('SELECT 1');break;}catch(e){if(n>=30)throw e;await delay(500);}}
 let fixtureNumber=0;
 async function fixture(name,configuration={currency:'EUR',integrationsEnabled:false}){
  const database=name+'_'+(++fixtureNumber);await admin.query('CREATE DATABASE '+database);const pool=new pg.Pool({host:'127.0.0.1',port,user:'postgres',password,database});pools.push(pool);
  const manifest=JSON.parse(await readFile(`modules/${name}/manifest.json`,'utf8'));
  const migrations=(await readdir(`modules/${name}/migrations`)).sort();manifest.persistence.migrations=[];
  for(let i=0;i<migrations.length;i++){const sql=await readFile(`modules/${name}/migrations/${migrations[i]}`,'utf8');await pool.query(sql);manifest.persistence.migrations.push({version:i+1,sha256:digest(sql)});}
  validateManifest(manifest);
  const definition=name==='inventory'?null:(await import(`../modules/${name}/dist/definition.js`))[name](manifest),installationId=randomUUID(),token=randomBytes(32).toString('base64url');
  const runtime={installationId,configuration};
  let app;const start=()=>{app=name==='inventory'?createInventoryServer(pool,token,async()=>3,async()=>{},'units',runtime,manifest):createBusinessServer(pool,token,runtime,definition,async()=>1,async()=>{});apps.push(app);};start();
  const all=[...new Set(manifest.api.map(a=>a.permission))];
  const request=async(method,path,body,permissions=all,status=200)=>{
   const result=await app.inject({method,url:path,headers:{authorization:'Bearer '+token,'x-steward-actor':'test-administrator','x-steward-permissions':JSON.stringify(permissions)},...(body===undefined?{}:{payload:body})});
   assert.equal(result.statusCode,status,`${method} ${path}: ${result.body}`);return result.json();
  };
  return{pool,manifest,request,get app(){return app;},token,installationId,configuration,all,restart:async()=>{await app.close();start();}};
 }
 await test('Procurement: persistence, actual transitions, approvals, receipts, retries and concurrent bounds',async()=>{
  const f=await fixture('procurement'),{request:q}=f;
  await q('POST','/suppliers',{code:'V1',name:'Synthetic Vendor',relationship:'external'},undefined,201);
  const order={number:'PO-1',supplierCode:'V1',lines:[{sku:'SKU-1',quantity:10,unitPriceCents:125}],shippingCents:200,currency:'EUR'};
  let r=(await q('POST','/orders',order,undefined,201)).record;
  assert.equal((await q('POST','/orders',order,undefined,201)).record.id,r.id);
  await q('POST','/orders',{...order,shippingCents:1},undefined,409);
  const action=async(name,permissions=f.all,status=200)=>{const input={revision:r.revision,requestId:randomUUID()};const result=await q('POST',`/${name}/${r.id}`,input,permissions,status);if(status===200){assert.deepEqual(await q('POST',`/${name}/${r.id}`,input,permissions),result);r=result.record;}};
  await action('approve',undefined,422);await action('submit');await action('approve',['cee.procurement.write'],403);await action('approve');await action('place');
  await q('PUT','/orders/'+r.id,{...order,revision:r.revision},undefined,422);
  const receipt={number:'GR-1',orderNumber:order.number,lines:[{sku:'SKU-1',quantity:6}]};
  const responses=await Promise.all([q('POST','/receipts',receipt,undefined,201),q('POST','/receipts',{...receipt,number:'GR-2'},undefined,422)]);
  assert.equal(responses[0].record.stockStatus,'not_requested');
  await q('POST','/receipts',receipt,undefined,201);
  r=(await q('GET','/orders')).records[0];assert.equal(r.status,'partially_received');
  await q('POST','/receipts',{...receipt,number:'GR-3',lines:[{sku:'SKU-1',quantity:4}]},undefined,201);
  assert.equal((await q('GET','/orders')).records[0].status,'received');
  assert.equal((await q('GET','/reports')).receivedCents,1450);
  await q('GET','/orders?limit=0',undefined,undefined,400);await q('GET','/orders?fields=credentials',undefined,undefined,400);
  assert.deepEqual(Object.keys((await q('GET','/orders?fields=number,status')).records[0]).sort(),['number','status']);
  await q('GET','/orders',undefined,[],403);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM business_audit')).rows[0].n,7);
 });
 await test('Sales: standalone fulfillment, constraints, revision protection and persisted restart',async()=>{
  const f=await fixture('sales'),q=f.request;await q('POST','/customers',{code:'C1',name:'Synthetic Customer',reference:'SYN-CUSTOMER'},undefined,201);
  const input={number:'SO-1',customerCode:'C1',currency:'EUR',lines:[{sku:'SKU',quantity:4,unitPriceCents:250}]};let order=(await q('POST','/orders',input,undefined,201)).record;
  const requestId=randomUUID();order=(await q('POST','/confirm/'+order.id,{revision:order.revision,requestId})).record;
  await q('PUT','/orders/'+order.id,{...input,revision:order.revision},undefined,422);
  await q('POST','/fulfillments',{number:'F1',orderNumber:order.number,lines:[{sku:'UNKNOWN',quantity:1}]},undefined,422);
  const fulfillment={number:'F1',orderNumber:order.number,lines:[{sku:'SKU',quantity:2}]};await q('POST','/fulfillments',fulfillment,undefined,201);await q('POST','/fulfillments',fulfillment,undefined,201);
  assert.equal((await q('GET','/orders')).records[0].status,'partially_fulfilled');await q('POST','/fulfillments',{...fulfillment,number:'F2'},undefined,201);
  await f.restart();assert.equal((await q('GET','/orders')).records[0].status,'fulfilled');assert.equal((await q('GET','/reports')).revenueCents,1000);
 });
 await test('Assets: explicit foreign ownership, authorization, capacity limits, publication and scheduling',async()=>{
  const owner=randomUUID(),user=randomUUID(),f=await fixture('assets',{currency:'EUR',integrationsEnabled:false,authorizedOwnerEntityIds:[owner]}),q=f.request;
  const relations={ownerEntityId:owner,custodianEntityId:user,userEntityId:user,accessBasis:'leased'};
  await q('POST','/facilities',{code:'SITE',name:'Synthetic leased site',site:'North',classification:'warehouse',...relations},undefined,201);
  const input={code:'A1',name:'Synthetic warehouse',facilityCode:'SITE',site:'North',classification:'warehouse',...relations,capacityM3:100,utilizedM3:10,availability:'available',monthlyOperatingCostCents:250000,currency:'EUR'};
  await q('POST','/assets',{...input,code:'BAD',ownerEntityId:randomUUID()},undefined,403);let asset=(await q('POST','/assets',input,undefined,201)).record;
  await q('POST','/publish/'+asset.id,{revision:asset.revision,requestId:randomUUID()},['cee.assets.write'],403);
  asset=(await q('POST','/publish/'+asset.id,{revision:asset.revision,requestId:randomUUID()})).record;const projection=(await f.pool.query('SELECT * FROM capacities')).rows[0];assert.equal(projection.ownership.ownerEntityId,owner);assert.notEqual(owner,user);assert.equal(Number(projection.available_m3),90);
  const booking={number:'B1',assetCode:'A1',purpose:'Synthetic reservation',startsAt:'2027-01-01T00:00:00Z',endsAt:'2027-02-01T00:00:00Z',capacityM3:60};await q('POST','/bookings',booking,undefined,201);await q('POST','/bookings',{...booking,number:'B2',capacityM3:40},undefined,409);
  await q('POST','/maintenance',{number:'M1',assetCode:'A1',description:'Synthetic inspection',startsAt:'2027-03-01T00:00:00Z',endsAt:'2027-03-02T00:00:00Z',costCents:1000},undefined,201);
  await q('POST','/bookings',{...booking,number:'B3',startsAt:'2027-03-01T00:00:00Z',endsAt:'2027-03-02T00:00:00Z'},undefined,422);
  assert.equal((await q('GET','/reports')).plannedMaintenance,1);
 });
 await test('Workforce: synthetic-only data, private local matching, capacity, real completion and aggregate-only projections',async()=>{
  const f=await fixture('workforce',{currency:'EUR',integrationsEnabled:false,syntheticOnly:true,minimumGroupSize:3}),q=f.request;
  const skill=(await q('POST','/skills',{code:'LOGISTICS',name:'Logistics',classification:'operational'},undefined,201)).record;
  await q('POST','/people',{reference:'REAL-1',displayName:'Someone',skills:[],availabilityUnits:1},undefined,400);
  const program=(await q('POST','/programs',{code:'P1',name:'Synthetic logistics training',skillCode:skill.code,seats:3,site:'North',startsAt:'2027-01-01T00:00:00Z',endsAt:'2027-02-01T00:00:00Z'},undefined,201)).record;
  const position=(await q('POST','/positions',{code:'JOB-1',title:'Synthetic logistics opportunity',requiredSkills:['LOGISTICS'],openings:3,site:'North',status:'open'},undefined,201)).record;
  for(let i=1;i<=3;i++){await q('POST','/people',{reference:'SYN-'+i,displayName:'Synthetic Person '+i,skills:[],availabilityUnits:1},undefined,201);const enrollment=(await q('POST','/enrollments',{number:'EN-'+i,personRef:'SYN-'+i,programCode:'P1'},undefined,201)).record;await q('POST','/complete/'+enrollment.id,{revision:enrollment.revision,requestId:randomUUID()});
   if(i===1){const published=await q('POST','/publish-skills/'+skill.id,{revision:skill.revision,requestId:randomUUID()});assert.equal(published.aggregate.availablePeople,null);assert.equal(published.aggregate.completions,null);}
  }
  await q('GET','/people',undefined,['cee.workforce.read'],403);await q('GET','/matches',undefined,['cee.workforce.read'],403);assert.equal((await q('GET','/matches')).records.length,3);
  await q('POST','/publish-skills/'+skill.id,{revision:skill.revision,requestId:randomUUID()});await q('POST','/publish-program/'+program.id,{revision:program.revision,requestId:randomUUID()});await q('POST','/publish-position/'+position.id,{revision:position.revision,requestId:randomUUID()});
  for(const table of ['workforce_supply','training_metrics','workforce_demand']){const projection=JSON.stringify((await f.pool.query('SELECT projection FROM '+table)).rows);assert(!/SYN-|displayName|personRef|Synthetic Person/.test(projection));}
  assert.equal((await f.pool.query('SELECT projection FROM workforce_supply')).rows[0].projection.availablePeople,3);
  assert(f.manifest.mcpTools.every(t=>!['listPerson','listEnrollment','listAchievement','candidateMatches'].includes(t.operationId)));
 });
 await test('Cross-module: concurrent partial reservations, lost acknowledgments, restarts, compensation, replenishment and exactly-once partial receipts',async()=>{
  const inventory=await fixture('inventory',{quantityUnit:'units',integrationsEnabled:true}),sales=await fixture('sales',{currency:'EUR',integrationsEnabled:true}),procurement=await fixture('procurement',{currency:'EUR',integrationsEnabled:true});
  const raw=async(f,method,url,payload,extra={})=>f.app.inject({method,url,headers:{authorization:'Bearer '+f.token,...extra},...(payload===undefined?{}:{payload})});
  const inbox=async(source,target,command)=>{authorizeCommand(command,source.manifest,target.manifest,{source:true,target:true});return raw(target,'POST','/integration-inbox',command,{'x-steward-integration-source':source.manifest.moduleId,'x-steward-installation':target.installationId});};
  const outbox=async f=>(await raw(f,'GET','/integration-outbox')).json().commands;
  const acknowledge=async(f,command,response)=>{const r=await raw(f,'POST','/integration-ack',{commandId:command.commandId,digest:digest(canonical(command)),status:response.statusCode===200?'delivered':'rejected',result:response.json()});assert.equal(r.statusCode,200,r.body);};
  await inventory.request('POST','/items',{sku:'SKU-1',name:'Synthetic stock',quantity:10,reservedQuantity:0,minStock:5},undefined,201);
  await sales.request('POST','/customers',{code:'C1',name:'Synthetic Customer',reference:'SYN-C1'},undefined,201);
  const orders=[];for(let i=1;i<=2;i++){let r=(await sales.request('POST','/orders',{number:'S'+i,customerCode:'C1',currency:'EUR',lines:[{sku:'SKU-1',quantity:8,unitPriceCents:100}]},undefined,201)).record;r=(await sales.request('POST','/confirm/'+r.id,{revision:r.revision,requestId:randomUUID()})).record;orders.push(r);}
  const commands=await outbox(sales);assert.equal(commands.length,2);const responses=await Promise.all(commands.map(c=>inbox(sales,inventory,c)));for(const r of responses)assert.equal(r.statusCode,200,r.body);
  assert.deepEqual(responses.map(r=>r.json().lines[0].reserved).sort((a,b)=>a-b),[2,8]);
  await inventory.restart();const replay=await inbox(sales,inventory,commands[0]);assert.deepEqual(replay.json(),responses[0].json());assert.equal(Number((await inventory.pool.query('SELECT reserved_quantity FROM inventory_items')).rows[0].reserved_quantity),10);
  const changed={...commands[0],payload:{orderId:commands[0].aggregateId,lines:[{sku:'SKU-1',quantity:1}]}};assert.equal((await inbox(sales,inventory,changed)).statusCode,409);
  assert.equal((await raw(inventory,'POST','/integration-inbox',commands[0])).statusCode,403);
  for(let i=0;i<commands.length;i++)await acknowledge(sales,commands[i],responses[i]);
  await sales.restart();const persisted=(await sales.request('GET','/orders')).records;assert.equal(persisted.reduce((n,r)=>n+r.reserved['SKU-1'],0),10);
  const low=(await outbox(inventory))[0];assert.equal(low.command,'stock.replenishment');const requisition=await inbox(inventory,procurement,low);assert.equal(requisition.statusCode,200,requisition.body);assert.deepEqual((await inbox(inventory,procurement,low)).json(),requisition.json());await acknowledge(inventory,low,requisition);assert.equal((await procurement.request('GET','/requisitions')).records.length,1);assert.equal((await procurement.request('GET','/orders')).records.length,0);
  const cancel=persisted.find(r=>r.reserved['SKU-1']===8);await sales.request('POST','/cancel/'+cancel.id,{revision:cancel.revision,requestId:randomUUID()});const release=(await outbox(sales))[0];const released=await inbox(sales,inventory,release);assert.equal(released.statusCode,200,released.body);await acknowledge(sales,release,released);
  const partial=persisted.find(r=>r.id!==cancel.id);const fulfillment=(await sales.request('POST','/fulfillments',{number:'F1',orderNumber:partial.number,lines:[{sku:'SKU-1',quantity:2}]},undefined,201)).record;assert.equal(fulfillment.status,'pending');
  const consumption=(await outbox(sales))[0];const consumed=await inbox(sales,inventory,consumption);assert.equal(consumed.statusCode,200,consumed.body);await acknowledge(sales,consumption,consumed);assert.equal((await sales.request('GET','/orders')).records.find(r=>r.id===partial.id).status,'partially_fulfilled');
  await procurement.request('POST','/suppliers',{code:'V',name:'Synthetic Vendor',relationship:'external'},undefined,201);let po=(await procurement.request('POST','/orders',{number:'PO',supplierCode:'V',currency:'EUR',shippingCents:0,lines:[{sku:'SKU-1',quantity:5,unitPriceCents:100}]},undefined,201)).record;
  for(const action of ['submit','approve','place'])po=(await procurement.request('POST',`/${action}/${po.id}`,{revision:po.revision,requestId:randomUUID()})).record;
  for(const [number,quantity]of [['R1',3],['R2',2]]){await procurement.request('POST','/receipts',{number,orderNumber:po.number,lines:[{sku:'SKU-1',quantity}]},undefined,201);const receipt=(await outbox(procurement))[0],received=await inbox(procurement,inventory,receipt);assert.equal(received.statusCode,200,received.body);assert.deepEqual((await inbox(procurement,inventory,receipt)).json(),received.json());await acknowledge(procurement,receipt,received);await acknowledge(procurement,receipt,received);}
  const stock=(await inventory.request('GET','/items')).records[0];assert.equal(stock.quantity,13);assert.equal(stock.reservedQuantity,0);assert.equal((await inventory.pool.query('SELECT count(*)::int AS n FROM inventory_movements')).rows[0].n,3);
 });
}finally{
 for(const app of apps)await app.close();for(const pool of pools)await pool.end();await admin?.end();
 try{docker(['rm','-f',container]);}catch{}
 await rm(secretFile,{force:true});
}
