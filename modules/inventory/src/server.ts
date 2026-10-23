import Fastify from 'fastify';
import type pg from 'pg';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {transaction,ensure,BusinessError,type Data,type Context} from '@steward/business-kit';
import type {ModulePackageManifest} from '@steward/module-sdk';
import {attachInventoryIntegration,replenish} from './integration.js';
export function createInventoryServer(pool:pg.Pool,token:string,migrate:()=>Promise<number>,ready:()=>Promise<void>,quantityUnit:string,runtime?:Data,manifest?:ModulePackageManifest){
 const app=Fastify({logger:false,bodyLimit:16384,requestTimeout:10000,ajv:{customOptions:{multipleOfPrecision:8}}});
 app.addHook('onRequest',async(request,reply)=>{if(request.url==='/health')return;const supplied=Buffer.from(request.headers.authorization?.startsWith('Bearer ')?request.headers.authorization.slice(7):''),expected=Buffer.from(token);if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reply.code(401).send({error:'Module gateway authentication required'});});
 app.get('/health',async()=>({status:'ok'}));
 app.get('/ready',async(_req,reply)=>{try{await ready();return{status:'ready'};}catch{return reply.code(503).send({error:'Module schema is not ready'});}});
 app.post('/internal/migrate',async(_req,reply)=>{try{return{schemaVersion:await migrate()};}catch{return reply.code(503).send({error:'Module migration failed; data and prior schema were retained'});}});
 const numeric={type:'number',minimum:0,maximum:999999999999.999,multipleOf:0.001};
 const properties={sku:{type:'string',minLength:1,maxLength:80,pattern:'\\S'},name:{type:'string',minLength:1,maxLength:160,pattern:'\\S'},quantity:numeric,reservedQuantity:numeric,minStock:{type:'integer',minimum:0,maximum:100000000}};
 const select='item_id AS id,sku,name,quantity::float8 AS quantity,reserved_quantity::float8 AS "reservedQuantity",(quantity-reserved_quantity)::float8 AS "availableQuantity",min_stock AS "minStock",revision';
 const tx=<T>(fn:(db:pg.PoolClient)=>Promise<T>)=>runtime?transaction(pool,fn):fn(pool as unknown as pg.PoolClient);
 const context=(db:pg.PoolClient):Context=>({db,config:runtime!.configuration,installationId:runtime!.installationId,moduleId:'cee.inventory',actor:'inventory',permissions:[]});
 app.get<{Querystring:Record<string,string>}>('/items',async req=>{
  const q=req.query,limit=Number(q.limit??20),offset=Number(q.offset??0);ensure(Number.isInteger(limit)&&limit>=1&&limit<=20&&Number.isInteger(offset)&&offset>=0&&offset<=100000,'Invalid pagination',400);
  const fields=q.fields?.split(',');ensure(!fields||fields.every(f=>['id','sku','name','quantity','reservedQuantity','availableQuantity','minStock','revision'].includes(f)),'Unknown selected field',400);
  const result=await pool.query('SELECT '+select+' FROM inventory_items ORDER BY sku LIMIT $1 OFFSET $2',[limit+1,offset]);return{records:result.rows.slice(0,limit).map(r=>fields?Object.fromEntries(fields.map(f=>[f,r[f]])):r),nextOffset:result.rows.length>limit?offset+limit:null,summary:'Quantity unit: '+quantityUnit};
 });
 app.post<{Body:{sku:string;name:string;quantity:number;reservedQuantity?:number;minStock?:number}}>('/items',{schema:{body:{type:'object',additionalProperties:false,required:['sku','name','quantity'],properties}}},async(req,reply)=>reply.code(201).send(await tx(async db=>{
  const b=req.body;ensure((b.reservedQuantity??0)<=b.quantity,'Reserved quantity exceeds stock',400);
  const result=await db.query('INSERT INTO inventory_items(item_id,sku,name,quantity,reserved_quantity,min_stock) VALUES($1,$2,$3,$4,$5,$6) RETURNING '+select,[randomUUID(),b.sku.trim(),b.name.trim(),b.quantity,b.reservedQuantity??0,b.minStock??0]);if(runtime)await replenish(context(db));return{record:result.rows[0]};
 })));
 app.put<{Params:{id:string};Body:{sku:string;name:string;quantity:number;reservedQuantity?:number;minStock?:number;revision:number}}>('/items/:id',{schema:{params:{type:'object',required:['id'],properties:{id:{type:'string',format:'uuid'}}},body:{type:'object',additionalProperties:false,required:['sku','name','quantity','revision'],properties:{...properties,revision:{type:'integer',minimum:1}}}}},async(req,reply)=>tx(async db=>{
  const b=req.body;ensure((b.reservedQuantity??0)<=b.quantity,'Reserved quantity exceeds stock',400);
  if(runtime){const old=(await db.query('SELECT sku,reserved_quantity FROM inventory_items WHERE item_id=$1 FOR UPDATE',[req.params.id])).rows[0];ensure(old,'Item no longer exists',409);ensure(old.sku===b.sku.trim(),'SKU identity is immutable',409);const active=Number((await db.query('SELECT COALESCE(sum(quantity),0) AS quantity FROM inventory_reservations WHERE sku=$1',[old.sku])).rows[0].quantity);ensure((b.reservedQuantity??Number(old.reserved_quantity))>=active,'Manual reserved quantity cannot remove active module reservations',409);ensure(b.quantity>=(b.reservedQuantity??Number(old.reserved_quantity)),'Quantity cannot be below reserved stock',409);}
  const result=await db.query('UPDATE inventory_items SET sku=$1,name=$2,quantity=$3,reserved_quantity=COALESCE($6,reserved_quantity),min_stock=COALESCE($7,min_stock),revision=revision+1,updated_at=now() WHERE item_id=$4 AND revision=$5 RETURNING '+select,[b.sku.trim(),b.name.trim(),b.quantity,req.params.id,b.revision,b.reservedQuantity??null,b.minStock??null]);
  if(!result.rowCount)return reply.code(409).send({error:'Item changed or no longer exists; refresh before editing'});if(runtime)await replenish(context(db));return{record:result.rows[0]};
 }));
 if(runtime&&manifest)attachInventoryIntegration(app,pool,runtime,manifest);
 app.setErrorHandler((error,_req,reply)=>{const e=error as {code?:string;statusCode?:number};return reply.code(error instanceof BusinessError?error.status:e.code==='23505'?409:e.statusCode&&e.statusCode<500?e.statusCode:500).send({error:error instanceof BusinessError?error.message:e.code==='23505'?'SKU already exists':'Inventory request failed'});});return app;
}
