import {requireCurrentMatch} from './monitor-current.js';
import {ensure,get,find,save,records,enqueueCapability,publicRecord,type Context,type Data,type Definition,type RecordValue,type ProviderIdentity} from '@steward/business-kit';
import {canonical,digest,validateCapabilityValue} from '@steward/module-sdk';
import {orderTotalCostCapabilityId,orderTotalCostOperation} from '@steward/commerce-kit';
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
export function withOrderTotals(def:Definition,hooks:{original:(c:Context,r:RecordValue)=>void;receipt:(c:Context,b:Data)=>ProviderIdentity}):Definition{
 const request=async(r:RecordValue,c:Context)=>{
  hooks.original(c,r);await requireCurrentMatch(c,r);ensure(r.data.totalStatus!=='pending'||Date.now()-Date.parse(r.data.totalRequestedAt)>300000,'Cost read pending',409);
  const a=await get(c,'order-association',r.data.associationId);hooks.original(c,a);const o=await get(c,'order',r.data.orderId),identity=await find(c,'connector-identity',a.data.shopifyConnectionId);
  ensure(o.data.connectionId===a.data.shopifyConnectionId&&identity&&same(identity.data,a.data.shopifyIdentity),'Original order/store identity required',403);const match=/^gid:\/\/shopify\/Order\/([0-9]+)$/.exec(o.data.remoteSourceId);ensure(match,'Shopify order identity required');
  const stored=await find(c,'order-total-read',r.id),prior=stored?.data.result;
  const offset=r.data.totalStatus==='incomplete'&&prior?.status==='ok'?prior.nextOffset??0:0;
  const payload={contractVersion:1,connectionId:a.data.connection.connectionId,accountId:a.data.connection.accountId,originDigest:a.data.connection.originDigest,shopOrderId:match[1],offset,limit:20};
  const id=await enqueueCapability(c,orderTotalCostCapabilityId,orderTotalCostOperation.name,r.id,payload,{expectedProvider:a.data.providerPin});
  const changed=await save(c,r.kind,r.key,{...r.data,totalStatus:'pending',totalCommandId:id,totalRequest:payload,totalProviderPin:a.data.providerPin,totalRequestedAt:new Date().toISOString()},r);return{record:publicRecord(changed)};
 };
 def.actions.push({path:'/read-order-totals/:id',kind:'order-match',concurrency:'current-state',permission:'cee.shopify.cost.read',run:async(r,c)=>{ensure(c.permissions.includes('cee.shopify.cost.read'),'Order cost read permission required',403);return request(r,c);}});
 const tick=def.tick;def.tick=async c=>{await tick?.(c);for(const policy of await records(c,'monitor-policy')){if(!policy.data.enabled||policy.data.collectCosts!==true||!policy.data.costApprovedBy||!same(policy.data.owner,c.providerIdentity))continue;for(const r of (await records(c,'order-match')).filter(r=>r.data.associationId===policy.data.associationId).slice(0,20)){if(r.data.totalStatus==='pending'&&Date.now()-Date.parse(r.data.totalRequestedAt)<300000)continue;if(r.data.totalRequestedAt&&Date.now()-Date.parse(r.data.totalRequestedAt)<Math.max(60,policy.data.intervalSeconds)*1000)continue;await request(r,c);}}};
 const old=def.acknowledge;def.acknowledge=async(command,status,result,c)=>{
  if(command.command!==orderTotalCostOperation.name)return old?.(command,status,result,c);
  const fingerprint=digest(canonical({status,result})),duplicate=(await c.db.query('SELECT response_digest FROM shopify_monitor_receipts WHERE command_id=$1',[command.commandId])).rows[0];if(duplicate){ensure(duplicate.response_digest===fingerprint,'Conflicting cost receipt',409);return;}
  const r=await get(c,'order-match',command.aggregateId);hooks.original(c,r);ensure(r.data.totalCommandId===command.commandId&&same(r.data.totalRequest,command.payload),'Cost command mismatch',409);
  if(status==='rejected')await save(c,r.kind,r.key,{...r.data,totalStatus:'unavailable'},r);
  else{
   ensure(same(hooks.receipt(c,result),r.data.totalProviderPin),'Original cost provider required',403);const {_steward,...body}=result;validateCapabilityValue(body,orderTotalCostOperation.output);const b=command.payload as Data;
   ensure(body.shopOrderId===b.shopOrderId&&body.connection.connectionId===b.connectionId&&body.connection.accountId===b.accountId&&body.connection.originDigest===b.originDigest&&body.items.every((i:Data)=>i.shopOrderId===b.shopOrderId),'Cost observation scope mismatch',403);
   ensure(!body.connection.observedAt||Date.parse(body.connection.observedAt)<=Date.now(),'Future cost observation rejected',409);
   let totalStatus=body.status==='ok'?(body.nextOffset===null?'complete':'incomplete'):body.status;
   let items=body.items;
   const stored=await find(c,'order-total-read',r.id);
   if(b.offset>0){const previous=stored?.data.result;if(previous?.nextOffset!==b.offset||previous.connection.observedAt!==body.connection.observedAt)totalStatus='stale';else items=[...previous.items,...items];}
   const keys=items.map((i:Data)=>i.remoteOrderId);if(new Set(keys).size!==keys.length||items.length>1000)totalStatus='ambiguous';
   const revisions=new Map<string,number>();for(const i of items){if(revisions.has(i.remoteOrderId)&&revisions.get(i.remoteOrderId)!==i.sourceRevision)totalStatus='ambiguous';revisions.set(i.remoteOrderId,i.sourceRevision);}
   if(body.nextOffset!==null&&body.nextOffset<=b.offset)totalStatus='ambiguous';
   if(body.status==='ok'&&(body.connection.state!=='ready'||Date.parse(body.connection.expiresAt)<=Date.now()))totalStatus='stale';
   await save(c,'order-total-read',r.id,{owner:r.data.owner,providerPin:r.data.totalProviderPin,result:{...body,items:items.slice(0,1000)}},stored);
   await save(c,r.kind,r.key,{...r.data,totalStatus},r);
  }
  await c.db.query('INSERT INTO shopify_monitor_receipts(command_id,response_digest) VALUES($1,$2)',[command.commandId,fingerprint]);
 };return def;
}
