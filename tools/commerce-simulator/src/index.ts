import {lockedFileOperation} from './persistence.js';
import Fastify from 'fastify';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
type Data=Record<string,any>;
const config:Data=JSON.parse(await readFile(process.env.SIMULATOR_CONFIG_FILE!,'utf8'));
if(!['shopify','printify'].includes(config.provider)||!Array.isArray(config.accounts)||!config.accounts.length)throw new Error('Simulator configuration required');
const directory=process.env.SIMULATOR_STATE_DIRECTORY??'/var/lib/simulator';await mkdir(directory,{recursive:true});
let state:Data;try{state=JSON.parse(await readFile(directory+'/state.json','utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;state={simulation:true,tenants:{}};}
for(const account of config.accounts)state.tenants[account.shopId]??={products:[],orders:[],events:[],creates:0,productionSubmissions:0,fulfillments:0};
let serial=Promise.resolve();
async function mutate<T>(fn:()=>T|Promise<T>):Promise<T>{let release!:()=>void;const prior=serial;serial=new Promise<void>(r=>{release=r;});await prior;try{const result=await fn();const snapshot=JSON.stringify(state);await lockedFileOperation(()=>writeFile(directory+'/state.tmp',snapshot));await lockedFileOperation(()=>rename(directory+'/state.tmp',directory+'/state.json'));return result;}finally{release();}}
const app=Fastify({https:{key:await readFile(config.tlsKeyFile),cert:await readFile(config.tlsCertFile),minVersion:'TLSv1.3'},logger:false,bodyLimit:131072});
const same=(a:unknown,b:string)=>{const x=Buffer.from(String(a??'')),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const actors=new WeakMap<object,Data>(),faults=new Map<string,Data>(),rates=new Map<string,{at:number;hits:number}>();
const check=(ok:unknown,message:string,statusCode=400)=>{if(!ok)throw Object.assign(new Error(message),{statusCode});};
app.addHook('onRequest',async(req,reply)=>{
 if(req.url==='/health')return;
 if(req.url.startsWith('/__sim/control')){check(same(req.headers.authorization,'Bearer '+config.adminToken),'Simulator operator authentication required',401);return;}
 const account=config.accounts.find((a:Data)=>same(config.provider==='shopify'?req.headers['x-shopify-access-token']:req.headers.authorization,config.provider==='shopify'?a.token:'Bearer '+a.token));check(account,'Invalid simulator API credential',401);actors.set(req,account);
 const now=Date.now(),rate=rates.get(account.shopId)??{at:now,hits:0};if(now-rate.at>60000){rate.at=now;rate.hits=0;}rates.set(account.shopId,rate);if(++rate.hits>600)return reply.code(429).header('retry-after','1').send({error:'Simulated API rate limit'});
 const fault=faults.get(account.shopId);if(fault&&fault.count>0&&req.url.includes(fault.path??'')){
  fault.count--;if(fault.delayMs)await new Promise(r=>setTimeout(r,Math.min(fault.delayMs,6000)));
  if(fault.status)return reply.code(fault.status).header('retry-after','1').send({error:'Controlled simulator failure'});
  if(fault.malformed)return reply.type('application/json').send('invalid-json');
 }
});
const account=(req:object)=>actors.get(req)!;
const tenant=(req:object)=>state.tenants[account(req).shopId];
function event(a:Data,topic:string,resource:Data){const id=randomUUID(),body=JSON.stringify(config.provider==='shopify'?resource:{id,type:topic,resource:{id:resource.id,type:'order',shop_id:a.shopId},created_at:new Date().toISOString()});const signature=createHmac('sha256',a.webhookSecret).update(body).digest(config.provider==='shopify'?'base64':'hex');const headers=config.provider==='shopify'?{'x-shopify-hmac-sha256':signature,'x-shopify-webhook-id':id,'x-shopify-topic':topic,'x-shopify-shop-domain':a.shopDomain,'x-shopify-api-version':'2026-10'}:{'x-pfy-signature':'sha256='+signature,'x-printify-event-id':id};state.tenants[a.shopId].events.push({id,body,headers});}
function finish(req:object,reply:any,value:Data,action:string){const f=faults.get(account(req).shopId);if(f?.dropAction===action&&f.dropCount>0){f.dropCount--;reply.raw.destroy();return value;}return value;}
app.get('/health',async()=>({status:'ok',simulation:true,provider:config.provider}));
app.get('/__sim/events',async req=>({simulation:true,events:tenant(req).events.slice(-20)}));
app.post<{Body:Data}>('/__sim/control',async req=>{
 const b=req.body,a=config.accounts.find((a:Data)=>a.shopId===b.shopId);check(a,'Unknown simulator shop',404);
 if(b.action==='fault'){check(Number.isInteger(b.fault?.count??0)&&(b.fault?.count??0)<=100,'Invalid bounded fault');faults.set(a.shopId,b.fault);return{simulation:true,configured:true};}
 return mutate(()=>{
  const t=state.tenants[a.shopId];
  if(b.action==='seed'){check(Array.isArray(b.products)&&Array.isArray(b.orders),'Explicit synthetic fixtures required');for(const [kind,values]of [['products',b.products],['orders',b.orders]] as const)for(const record of values){check(typeof record.id==='string'&&record.id.startsWith(config.provider==='shopify'?'gid://shopify/':'syn-'),'Synthetic source IDs required');const i=t[kind].findIndex((v:Data)=>v.id===record.id);if(i<0)t[kind].push(record);}return{simulation:true,seeded:true};}
  if(b.action==='snapshot')return{simulation:true,shopId:a.shopId,...t};
  if(b.action==='event'){const r=t[b.kind].find((v:Data)=>v.id===b.id);check(r,'Synthetic record not found',404);event(a,b.topic,r);if(b.duplicate)t.events.push(structuredClone(t.events.at(-1)));return{simulation:true,event:t.events.at(-1)};}
  if(b.action==='update'){
   check(['products','orders'].includes(b.kind),'Invalid resource');const r=t[b.kind].find((v:Data)=>v.id===b.id);check(r,'Synthetic record not found',404);check(b.patch&&typeof b.patch==='object','Patch required');
   Object.assign(r,b.patch,{updatedAt:b.patch.updatedAt??new Date().toISOString(),updated_at:b.patch.updated_at??new Date().toISOString()});event(a,b.topic??(config.provider==='shopify'?'orders/updated':'order:updated'),r);return{simulation:true,record:r};
  }
  if(b.action==='reset'){check(typeof b.prefix==='string'&&b.prefix.startsWith('SYN-')&&b.prefix.length>=6,'Owned synthetic prefix required');t.orders=t.orders.filter((r:Data)=>!String(r.external_id??r.name??'').startsWith(b.prefix));return{simulation:true,reset:true};}
  check(false,'Unknown simulator control action');
 });
});
const page=(records:Data[],first:number,after?:string)=>{check(Number.isInteger(first)&&first>=1&&first<=20,'Invalid page size');const offset=after?Number(Buffer.from(after,'base64').toString()):0;check(Number.isSafeInteger(offset)&&offset>=0,'Invalid cursor');const nodes=records.slice(offset,offset+first);return{nodes,pageInfo:{hasNextPage:offset+first<records.length,endCursor:Buffer.from(String(offset+nodes.length)).toString('base64')}};};
if(config.provider==='shopify')app.post<{Body:Data}>('/admin/api/2026-10/graphql.json',async(req,reply)=>{
 const {query,variables:v={}}=req.body,t=tenant(req),a=account(req);check(typeof query==='string','GraphQL query required');
 const scope=(s:string)=>check(a.scopes.includes(s),'Simulator application scope denied',403);
 if(query.includes('StewardProducts')){scope('read_products');return{data:{products:page(t.products,v.first??2,v.after)}};}
 if(query.includes('StewardOrders')){scope('read_orders');return{data:{orders:page(t.orders,v.first??2,v.after)}};}
 if(query.includes('StewardOrder')){scope('read_orders');return{data:{order:t.orders.find((o:Data)=>o.id===v.id)??null}};}
 if(query.includes('StewardFulfillment')){
  scope('write_merchant_managed_fulfillment_orders');return mutate(()=>{
   const input=v.fulfillment,fo=input?.lineItemsByFulfillmentOrder?.[0],o=t.orders.find((o:Data)=>o.fulfillmentOrders.nodes.some((f:Data)=>f.id===fo?.fulfillmentOrderId));check(o,'Unknown fulfillment order');
   const source=o.fulfillmentOrders.nodes.find((f:Data)=>f.id===fo.fulfillmentOrderId);for(const l of fo.fulfillmentOrderLineItems??[])check(source.lineItems.nodes.some((n:Data)=>n.id===l.id&&n.remainingQuantity>=l.quantity),'Invalid fulfillment quantity');
   const f={id:'gid://shopify/Fulfillment/'+randomUUID(),status:'SUCCESS',trackingInfo:[{number:input.trackingInfo.number}],fulfillmentLineItems:{nodes:fo.fulfillmentOrderLineItems.map((l:Data)=>({quantity:l.quantity,lineItem:{id:source.lineItems.nodes.find((n:Data)=>n.id===l.id).lineItem.id}}))}};
   o.fulfillments.push(f);o.displayFulfillmentStatus='FULFILLED';o.updatedAt=new Date().toISOString();t.fulfillments++;event(a,'orders/updated',o);
   return finish(req,reply,{data:{fulfillmentCreate:{fulfillment:f,userErrors:[]}}},'fulfillment');
  });
 }
 return reply.code(400).send({errors:[{message:'Unsupported simulator query'}]});
});
if(config.provider==='printify'){
 app.get('/v1/shops.json',async req=>[{id:account(req).shopId,title:'Synthetic shop',sales_channel:'api'}]);
 app.get<{Params:{shop:string;kind:string};Querystring:{page?:string;limit?:string}}>('/v1/shops/:shop/:kind.json',async req=>{
  check(req.params.shop===account(req).shopId,'Shop scope denied',403);check(['products','orders'].includes(req.params.kind),'Unknown resource',404);
  const p=Number(req.query.page??1),limit=Number(req.query.limit??2);check(Number.isInteger(p)&&p>0&&Number.isInteger(limit)&&limit>0&&limit<=20,'Invalid pagination');const values=tenant(req)[req.params.kind];return{data:values.slice((p-1)*limit,p*limit),current_page:p,last_page:Math.max(1,Math.ceil(values.length/limit))};
 });
 app.get<{Params:{shop:string;id:string}}>('/v1/shops/:shop/orders/:id.json',async req=>{check(req.params.shop===account(req).shopId,'Shop scope denied',403);const o=tenant(req).orders.find((o:Data)=>o.id===req.params.id);check(o,'Order not found',404);return o;});
 app.post<{Params:{shop:string};Body:Data}>('/v1/shops/:shop/orders.json',async(req,reply)=>mutate(()=>{
  const a=account(req),t=tenant(req),b=req.body;check(req.params.shop===a.shopId&&a.scopes.includes('orders.write'),'Production scope denied',403);check(typeof b.external_id==='string'&&b.line_items?.length>0&&b.address_to?.country,'Order input required');
  let production=0,shipping=0;for(const l of b.line_items){const product=t.products.find((p:Data)=>p.id===l.product_id),variant=product?.variants.find((v:Data)=>v.id===l.variant_id&&v.is_enabled);check(variant&&Number.isInteger(l.quantity)&&l.quantity>0,'Unknown production variant');production+=variant.cost*l.quantity;shipping+=variant.shipping_cost*l.quantity;}
  const o={id:'syn-'+randomUUID(),external_id:b.external_id,line_items:b.line_items,status:'pending',total_price:production,total_shipping:shipping,currency:a.currency,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),shipments:[]};t.orders.push(o);t.creates++;event(a,'order:created',o);return finish(req,reply,o,'create');
 }));
 app.post<{Params:{shop:string};Body:Data}>('/v1/shops/:shop/orders/shipping.json',async req=>{check(req.params.shop===account(req).shopId,'Shop scope denied',403);let total=0;for(const l of req.body.line_items){const p=tenant(req).products.find((p:Data)=>p.id===l.product_id),v=p?.variants.find((v:Data)=>v.id===l.variant_id);check(v,'Unknown shipping variant');total+=v.shipping_cost*l.quantity;}return{standard:total};});
 app.post<{Params:{shop:string;id:string}}>('/v1/shops/:shop/orders/:id/send_to_production.json',async(req,reply)=>mutate(()=>{
  const a=account(req),t=tenant(req);check(req.params.shop===a.shopId&&a.scopes.includes('orders.write'),'Production scope denied',403);const o=t.orders.find((o:Data)=>o.id===req.params.id);check(o,'Unknown order',404);check(o.status==='pending','Production already submitted; this API is deliberately non-idempotent',409);
  o.status='in-production';o.updated_at=new Date().toISOString();t.productionSubmissions++;event(a,'order:updated',o);return finish(req,reply,{},'produce');
 }));
}
app.setErrorHandler((error,_req,reply)=>reply.code((error as any).statusCode??500).send({error:(error as any).statusCode?(error as Error).message:'Simulator failure',simulation:true}));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void app.close());
await app.listen({host:'0.0.0.0',port:Number(process.env.PORT??8443)});
