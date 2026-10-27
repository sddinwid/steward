import {ensure,type Context,type Data} from '@steward/business-kit';
import {canonical,digest} from '@steward/module-sdk';
import {makeUnitDefinition} from '@steward/catalog-kit/operational';
import {COST_SUPPORTED_CURRENCIES as SUPPORTED_PRICING_CURRENCIES,COST_MAX_AMOUNT_CENTS as MAX_PRICE_CENTS} from '@steward/catalog-kit/cost-evidence';
/** Called only after a complete successful catalog GET, in its persistence transaction. */
export async function recordProductionCostSync(ctx:Context,secret:Data,products:Data[]){
 const seconds=Number(ctx.config.costObservationMaxAgeSeconds??3600);ensure(Number.isInteger(seconds)&&seconds>=10&&seconds<=86400,'Invalid production cost freshness policy',503);
 const origin=(await ctx.db.query('SELECT origin_digest FROM external_catalog_origins WHERE connection_id=$1',[secret.connectionId])).rows[0];ensure(origin,'Original catalog connection evidence required',503);
 const currency=typeof secret.costCurrency==='string'&&(SUPPORTED_PRICING_CURRENCIES as readonly string[]).includes(secret.costCurrency)&&secret.costCurrency===ctx.config.currency?secret.costCurrency:null;
 const confirmation=currency?digest(canonical({contractVersion:1,originDigest:origin.origin_digest,currency,basis:'operator-confirmed-private-connection'})):null;
 const unit=makeUnitDefinition('item',0),validCost=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=MAX_PRICE_CENTS?n:null;
 const facts=products.map(p=>({productId:p.id,name:typeof p.title==='string'&&p.title.trim()?p.title:null,variants:p.variants.map((v:Data)=>({id:v.id,sku:typeof v.sku==='string'&&v.sku.trim()?v.sku:null,enabled:v.is_enabled&&v.is_available!==false,cost:validCost(v.cost)})).sort((a:Data,b:Data)=>String(a.id).localeCompare(String(b.id)))})).sort((a,b)=>String(a.productId).localeCompare(String(b.productId)));
 const snapshot=digest(canonical({contractVersion:1,originDigest:origin.origin_digest,currency,currencyConfirmation:confirmation,unitDefinition:unit,products:facts})),old=(await ctx.db.query('SELECT * FROM printify_cost_sync WHERE connection_id=$1 FOR UPDATE',[secret.connectionId])).rows[0];
 const generation=old?.snapshot_digest===snapshot?String(old.generation):String((await ctx.db.query("SELECT nextval('printify_cost_generation') n")).rows[0].n);
 await ctx.db.query("INSERT INTO printify_cost_sync(connection_id,generation,snapshot_digest,currency,currency_confirmation_digest,observed_at,expires_at,unit_definition) VALUES($1,$2,$3,$4,$5,now(),now()+($7::integer*interval '1 second'),$6) ON CONFLICT(connection_id) DO UPDATE SET generation=EXCLUDED.generation,snapshot_digest=EXCLUDED.snapshot_digest,currency=EXCLUDED.currency,currency_confirmation_digest=EXCLUDED.currency_confirmation_digest,observed_at=EXCLUDED.observed_at,expires_at=EXCLUDED.expires_at,unit_definition=EXCLUDED.unit_definition",[secret.connectionId,generation,snapshot,currency,confirmation,unit,seconds]);
}
