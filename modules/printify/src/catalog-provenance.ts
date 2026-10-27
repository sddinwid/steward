import type pg from 'pg';
import {ensure,transaction,type Context,type Data} from '@steward/business-kit';
import {canonical,digest} from '@steward/module-sdk';
export interface CatalogConnectionOrigin {provider:'shopify'|'printify';mode:'live'|'simulator';connectionId:string;accountId:string;shopDomain:string|null}
/** Called only after a complete successful provider catalog read, in its persistence transaction. */
export async function recordCatalogSync(ctx:Context,origin:CatalogConnectionOrigin,products:Data[]){
 ensure(ctx.moduleId==='cee.'+origin.provider&&ctx.config.mode===origin.mode,'External catalog provider origin mismatch',503);
 ensure(/^[a-z][a-z0-9-]{0,39}$/.test(origin.connectionId)&&origin.accountId.length>0&&origin.accountId.length<=200&&['live','simulator'].includes(origin.mode),'External catalog origin invalid',503);
 await ctx.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['external-catalog:'+origin.connectionId]);
 const old=(await ctx.db.query('SELECT origin,origin_digest FROM external_catalog_origins WHERE connection_id=$1',[origin.connectionId])).rows[0],originDigest=digest(canonical(origin));ensure(!old||old.origin_digest===originDigest,'External catalog connection reuse requires reconciliation',409);
 if(!old)await ctx.db.query('INSERT INTO external_catalog_origins(connection_id,origin,origin_digest) VALUES($1,$2,$3)',[origin.connectionId,origin,originDigest]);
 const lease=Number(ctx.config.catalogObservationMaxAgeSeconds??3600);ensure(Number.isInteger(lease)&&lease>=10&&lease<=86400,'Invalid catalog observation freshness policy',503);
 const nullableText=(value:unknown)=>typeof value==='string'&&value.trim().length>0?value:null;
 const facts=products.map(p=>origin.provider==='shopify'?{productId:p.id,name:nullableText(p.title),status:p.status,variants:(Array.isArray(p.variants)?p.variants:p.variants.nodes).map((v:Data)=>({id:v.id,sku:nullableText(v.sku)})).sort((a:Data,b:Data)=>String(a.id).localeCompare(String(b.id)))}:{productId:p.id,name:nullableText(p.title),printProviderId:p.print_provider_id,blueprintId:p.blueprint_id,variants:p.variants.map((v:Data)=>({id:v.id,sku:nullableText(v.sku),enabled:v.is_enabled&&v.is_available!==false})).sort((a:Data,b:Data)=>String(a.id).localeCompare(String(b.id)))}).sort((a,b)=>String(a.productId).localeCompare(String(b.productId)));
 const snapshotDigest=digest(canonical(facts)),previous=(await ctx.db.query('SELECT * FROM external_catalog_sync WHERE connection_id=$1 FOR UPDATE',[origin.connectionId])).rows[0];
 const generation=previous?.snapshot_digest===snapshotDigest?String(previous.generation):String((await ctx.db.query("SELECT nextval('external_catalog_generation') AS n")).rows[0].n);
 await ctx.db.query("INSERT INTO external_catalog_sync(connection_id,generation,snapshot_digest,observed_at,expires_at,product_count,lease_seconds,product_ids,status,error) VALUES($1,$2,$3,now(),now()+($5::integer*interval '1 second'),$4,$5,$6,'available',NULL) ON CONFLICT(connection_id) DO UPDATE SET generation=EXCLUDED.generation,snapshot_digest=EXCLUDED.snapshot_digest,observed_at=EXCLUDED.observed_at,expires_at=EXCLUDED.expires_at,product_count=EXCLUDED.product_count,product_ids=EXCLUDED.product_ids,lease_seconds=EXCLUDED.lease_seconds,status='available',error=NULL",[origin.connectionId,generation,snapshotDigest,products.length,lease,JSON.stringify(facts.map(p=>p.productId))]);
}
/** Failure updates availability only; last successful observed_at is never renewed. */
export async function catalogSyncUnavailable(pool:pg.Pool,connectionId:string|undefined,error:string){await transaction(pool,async db=>{await db.query("UPDATE external_catalog_sync SET status='unavailable',error=$2 WHERE ($1::text IS NULL OR connection_id=$1)",[connectionId??null,/^[A-Z_]{1,100}$/.test(error)?error:'CATALOG_PROVIDER_UNAVAILABLE']);});}

/** Removing one configured profile does not mark other independent profiles unavailable. */
export async function catalogConnectionsConfigured(pool:pg.Pool,configured:string[]){await pool.query("UPDATE external_catalog_sync SET status='unavailable',error='CATALOG_PROFILE_NOT_CONFIGURED' WHERE NOT(connection_id=ANY($1::text[]))",[configured]);}
