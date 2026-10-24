import type pg from 'pg';
import {transaction,save,find,ensure,publicRecord,type Data,type Context} from '@steward/business-kit';
import {canonical,digest} from '@steward/module-sdk';
export function context(db:pg.PoolClient,runtime:Data):Context{return{db,config:runtime.configuration,installationId:runtime.installationId,moduleId:runtime.moduleId,actor:'connector-runtime',permissions:[]};}
export function connectionSource(connectionId:string|undefined,remoteId:string){return !connectionId||connectionId==='default'?remoteId:'store:'+connectionId+':'+digest(remoteId).slice(0,48);}
const pollTimes=new WeakMap<pg.Pool,Map<string,number>>();
export const nextPoll=(pool:pg.Pool,runtime:Data)=>pollTimes.get(pool)?.get(runtime.connectionId??'default')??0;
export function deferPoll(pool:pg.Pool,runtime:Data,delay:number){const times=pollTimes.get(pool)??new Map<string,number>();times.set(runtime.connectionId??'default',Date.now()+delay);pollTimes.set(pool,times);}
export async function connectorState(pool:pg.Pool,runtime:Data,status:string,error:string|null=null){await transaction(pool,async db=>{const ctx=context(db,runtime),key=!runtime.connectionId||runtime.connectionId==='default'?'connection':runtime.connectionId,old=await find(ctx,'connector',key);if(old?.data.status===status&&old?.data.error===error)return;await save(ctx,'connector',key,{name:key,mode:ctx.config.mode,status,error},old);});}
/** A module-owned receipt commits before non-repeatable external effects. */
export async function issued(pool:pg.Pool,key:string,payload:Data,call:()=>Promise<any>):Promise<any>{
 const hash=digest(canonical(payload)),old=(await pool.query('SELECT * FROM connector_issuance WHERE request_key=$1',[key])).rows[0];
 if(old){ensure(old.digest===hash,'External request identity changed',409);ensure(old.state==='responded','External outcome is uncertain; reconcile before another request',409);return old.response;}
 await pool.query("INSERT INTO connector_issuance(request_key,digest,state) VALUES($1,$2,'issued')",[key,hash]);
 const response=await call();await pool.query("UPDATE connector_issuance SET state='responded',response=$2,updated_at=now() WHERE request_key=$1",[key,response]);return response;
}
export async function reconciled(pool:pg.Pool,key:string,response:Data){await pool.query("UPDATE connector_issuance SET state='responded',response=$2,updated_at=now() WHERE request_key=$1 AND state='issued'",[key,response]);}
export const connectorSql=`CREATE TABLE connector_events(event_id text PRIMARY KEY,digest text NOT NULL,received_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE connector_issuance(request_key text PRIMARY KEY,digest text NOT NULL,state text NOT NULL CHECK(state IN ('issued','responded')),response jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());`;
export async function page(ctx:Context,kind:string,q:Record<string,string>={},fields:string[]=[]){
 const limit=Number(q.limit??20),offset=Number(q.offset??0);ensure(Number.isInteger(limit)&&limit>=1&&limit<=20&&Number.isInteger(offset)&&offset>=0&&offset<=100000,'Invalid pagination',400);
 const selected=q.fields?.split(',');ensure(!selected||selected.every(k=>fields.includes(k)||['id','revision'].includes(k)),'Unknown selected field',400);
 const rows=(await ctx.db.query("SELECT * FROM business_records WHERE kind=$1 AND ($2='' OR data->>'status'=$2) ORDER BY key LIMIT $3 OFFSET $4",[kind,q.status??'',limit+1,offset])).rows;
 return{records:rows.slice(0,limit).map(r=>{const value=publicRecord(r);return selected?Object.fromEntries(selected.map(k=>[k,value[k]])):value;}),nextOffset:rows.length>limit?offset+limit:null,summary:'Connector-owned observations and receipts. Simulator/live mode is explicit; no credentials or personal data.'};
}
export function cents(value:string){ensure(/^\d+(?:\.\d{1,2})?$/.test(value),'Unsupported monetary precision');const [whole,fraction='']=value.split('.');const n=BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0'));ensure(n<=1000000000000n,'Amount exceeds supported integer bounds');return Number(n);}

export async function bindConnectionIdentity(pool:pg.Pool,runtime:Data,secret:Data){
 await transaction(pool,async db=>{const ctx=context(db,runtime),key=secret.connectionId??'default';const identity={provider:secret.provider,mode:secret.mode,baseUrl:secret.baseUrl,shopId:secret.shopId??null,shopDomain:secret.shopDomain??null};const old=await find(ctx,'connector-identity',key);ensure(!old||canonical(old.data)===canonical(identity),'Store identity changed for an existing connection; retain the old connection for reconciliation and configure a new identity',409);if(!old)await save(ctx,'connector-identity',key,identity);});
}
export async function unavailableConnections(pool:pg.Pool,runtime:Data,configured:string[],error='CONNECTOR_CONNECTION_REMOVED'){
 const identities=(await pool.query("SELECT key FROM business_records WHERE kind='connector-identity'")).rows;
 for(const row of identities)if(!configured.includes(row.key))await connectorState(pool,{...runtime,connectionId:row.key},'connection_unavailable',error);
}
