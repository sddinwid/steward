import type pg from 'pg';
import {ensure,find,save,records,transaction,type Data} from '@steward/business-kit';
import {canonical} from '@steward/module-sdk';
import {remote,context,connectionSource,bindConnectionIdentity,ConnectorError} from '@steward/commerce-kit';
import {recordCatalogSync} from './catalog-provenance.js';
/** Existing connector GET transport only. Injectable reader is an isolated adapter-test seam. */
export async function synchronizePrintifyCatalog(pool:pg.Pool,runtime:Data,s:Data,read:typeof remote=remote){
 await bindConnectionIdentity(pool,runtime,s);
 const shops=await read(s,'/v1/shops.json');ensure(Array.isArray(shops)&&shops.some((shop:Data)=>String(shop.id)===s.shopId),'Printify shop not authorized',403);
 const products:Data[]=[];for(let page=1;;page++){ensure(page<=50,'CONNECTOR_PAGE_BUDGET_REACHED',503);const r=await read(s,`/v1/shops/${encodeURIComponent(s.shopId)}/products.json?page=${page}&limit=2`);ensure(Array.isArray(r.data)&&Number.isInteger(r.last_page)&&r.last_page>=0&&r.last_page<=50&&(r.last_page>=page||(page===1&&r.last_page===0&&r.data.length===0)),'Invalid Printify page',503);products.push(...r.data);if(page===r.last_page||r.last_page===0)break;}
 ensure(new Set(products.map(p=>p.id)).size===products.length,'Duplicate Printify product identity',503);
 for(const p of products){ensure(typeof p.id==='string'&&p.id.length>0&&typeof p.title==='string'&&Array.isArray(p.variants)&&p.variants.length<=2048&&new Set(p.variants.map((v:Data)=>v.id)).size===p.variants.length,'Invalid Printify product',503);for(const v of p.variants)ensure(Number.isSafeInteger(v.id)&&v.id>0&&typeof v.is_enabled==='boolean'&&(v.sku==null||typeof v.sku==='string'),'Invalid Printify variant',503);}
 await transaction(pool,async db=>{const ctx=context(db,runtime),seen=new Set();
 for(const shop of shops.filter((shop:Data)=>String(shop.id)===s.shopId)){const data={sourceId:connectionSource(s.connectionId,String(shop.id)),remoteSourceId:String(shop.id),connectionId:s.connectionId,title:String(shop.title??shop.id),salesChannel:String(shop.sales_channel??'unknown')},old=await find(ctx,'shop',data.sourceId);if(!old||canonical(old.data)!==canonical(data))await save(ctx,'shop',data.sourceId,data,old);}
 for(const p of products){const data={sourceId:connectionSource(s.connectionId,p.id),remoteSourceId:p.id,connectionId:s.connectionId,title:p.title,printProviderId:p.print_provider_id,blueprintId:p.blueprint_id,variants:p.variants.map((v:Data)=>({id:v.id,isEnabled:v.is_enabled&&v.is_available!==false,unitCostCents:Number.isSafeInteger(v.cost)&&v.cost>=0?v.cost:null,sourceSku:v.sku??null}))};seen.add(data.sourceId);const old=await find(ctx,'product',data.sourceId);if(!old||canonical(old.data)!==canonical(data))await save(ctx,'product',data.sourceId,data,old);}
 for(const old of await records(ctx,'product'))if((old.data.connectionId??'default')===s.connectionId&&!seen.has(old.key)&&old.data.variants.some((v:Data)=>v.isEnabled))await save(ctx,'product',old.key,{...old.data,variants:old.data.variants.map((v:Data)=>({...v,isEnabled:false}))},old);
 await recordCatalogSync(ctx,{provider:'printify',mode:s.mode,connectionId:s.connectionId,accountId:s.shopId,shopDomain:null},products);
 });
}
