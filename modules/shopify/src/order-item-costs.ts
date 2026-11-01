import {ensure,get,find,save,enqueueCapability,publicRecord,type Context,type Data,type Definition,type RecordValue,type ProviderIdentity} from '@steward/business-kit';
import {canonical,digest,validateCapabilityValue} from '@steward/module-sdk';
import {orderItemCostCapabilityId,orderItemCostOperation} from '@steward/commerce-kit';
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
export function itemCostView(r:RecordValue,order:RecordValue){
 const result=r.data.costResult;const status=result?.connection?.expiresAt&&Date.parse(result.connection.expiresAt)<=Date.now()?'stale':r.data.costStatus??'not_requested';
 return{status,observedAt:result?.connection?.observedAt??null,nextOffset:result?.nextOffset??null,items:(result?.items??[]).map((v:Data)=>{
  // Only an explicitly supplied exact Shopify GID is treated as a source line reference.
  const candidates=/^gid:\/\/shopify\/LineItem\/[0-9]+$/.test(v.item.externalLineId??'')?(order.data.lines??[]).filter((l:Data)=>l.remoteLineId===v.item.externalLineId):[];
  const repeated=(result.items as Data[]).filter(i=>i.item.externalLineId&&i.item.externalLineId===v.item.externalLineId).length>1;
  return{...v,shopifyLineMatch:candidates.length===1&&!repeated&&v.item.identityStatus==='unique'&&v.isReprint!==true?'exact_external_reference':candidates.length||repeated||v.item.identityStatus==='ambiguous'?'ambiguous':'unmatched',shopifyLineId:candidates.length===1&&!repeated&&v.item.identityStatus==='unique'&&v.isReprint!==true?candidates[0].remoteLineId:null};
 }),basis:'Provider-reported amounts, not settlement or net profit. No quantity allocation or unmatched-line revenue allocation is inferred.'};
}
export function withOrderItemCosts(def:Definition,hooks:{original:(c:Context,r:RecordValue)=>void;receipt:(c:Context,b:Data)=>ProviderIdentity}):Definition{
 def.actions.push({path:'/read-order-item-costs/:id',kind:'order-match',permission:'cee.shopify.cost.read',run:async(r,c)=>{
  hooks.original(c,r);ensure(c.permissions.includes('cee.shopify.cost.read'),'Order cost read permission required',403);ensure(r.data.costStatus!=='pending'||Date.now()-Date.parse(r.data.costRequestedAt)>300000,'Cost read pending',409);
  const a=await get(c,'order-association',r.data.associationId);hooks.original(c,a);const o=await get(c,'order',r.data.orderId),identity=await find(c,'connector-identity',a.data.shopifyConnectionId);
  ensure(o.data.connectionId===a.data.shopifyConnectionId&&identity&&same(identity.data,a.data.shopifyIdentity),'Original order/store identity required',403);const match=/^gid:\/\/shopify\/Order\/([0-9]+)$/.exec(o.data.remoteSourceId);ensure(match,'Shopify order identity required');
  const stored=await find(c,'order-item-cost-read',r.id),prior=stored?.data.result;
  const offset=r.data.costStatus==='incomplete'&&prior?.status==='ok'?prior.nextOffset??0:0;
  const payload={contractVersion:1,connectionId:a.data.connection.connectionId,accountId:a.data.connection.accountId,originDigest:a.data.connection.originDigest,shopOrderId:match[1],offset,limit:20};
  const id=await enqueueCapability(c,orderItemCostCapabilityId,orderItemCostOperation.name,r.id,payload,{expectedProvider:a.data.providerPin});
  const changed=await save(c,r.kind,r.key,{...r.data,costStatus:'pending',costCommandId:id,costRequest:payload,costProviderPin:a.data.providerPin,costRequestedAt:new Date().toISOString()},r);return{record:publicRecord(changed)};
 }});
 const old=def.acknowledge;def.acknowledge=async(command,status,result,c)=>{
  if(command.command!==orderItemCostOperation.name)return old?.(command,status,result,c);
  const fingerprint=digest(canonical({status,result})),duplicate=(await c.db.query('SELECT response_digest FROM shopify_monitor_receipts WHERE command_id=$1',[command.commandId])).rows[0];if(duplicate){ensure(duplicate.response_digest===fingerprint,'Conflicting cost receipt',409);return;}
  const r=await get(c,'order-match',command.aggregateId);hooks.original(c,r);ensure(r.data.costCommandId===command.commandId&&same(r.data.costRequest,command.payload),'Cost command mismatch',409);
  if(status==='rejected')await save(c,r.kind,r.key,{...r.data,costStatus:'unavailable'},r);
  else{
   ensure(same(hooks.receipt(c,result),r.data.costProviderPin),'Original cost provider required',403);const {_steward,...body}=result;validateCapabilityValue(body,orderItemCostOperation.output);const b=command.payload as Data;
   ensure(body.shopOrderId===b.shopOrderId&&body.connection.connectionId===b.connectionId&&body.connection.accountId===b.accountId&&body.connection.originDigest===b.originDigest&&body.items.every((i:Data)=>i.shopOrderId===b.shopOrderId),'Cost observation scope mismatch',403);
   ensure(!body.connection.observedAt||Date.parse(body.connection.observedAt)<=Date.now(),'Future cost observation rejected',409);
   let costStatus=body.status==='ok'?(body.nextOffset===null?'complete':'incomplete'):body.status;
   let items=body.items;
   const stored=await find(c,'order-item-cost-read',r.id);
   if(b.offset>0){const previous=stored?.data.result;if(previous?.nextOffset!==b.offset||previous.connection.observedAt!==body.connection.observedAt)costStatus='stale';else items=[...previous.items,...items];}
   const keys=items.map((i:Data)=>i.remoteOrderId+':'+i.item.lineKey);if(new Set(keys).size!==keys.length||items.length>1000)costStatus='ambiguous';
   const revisions=new Map<string,number>();for(const i of items){if(revisions.has(i.remoteOrderId)&&revisions.get(i.remoteOrderId)!==i.sourceRevision)costStatus='ambiguous';revisions.set(i.remoteOrderId,i.sourceRevision);}
   if(body.nextOffset!==null&&body.nextOffset<=b.offset)costStatus='ambiguous';
   if(body.status==='ok'&&(body.connection.state!=='ready'||Date.parse(body.connection.expiresAt)<=Date.now()))costStatus='stale';
   await save(c,'order-item-cost-read',r.id,{owner:r.data.owner,providerPin:r.data.costProviderPin,result:{...body,items:items.slice(0,1000)}},stored);
   await save(c,r.kind,r.key,{...r.data,costStatus},r);
  }
  await c.db.query('INSERT INTO shopify_monitor_receipts(command_id,response_digest) VALUES($1,$2)',[command.commandId,fingerprint]);
 };return def;
}
