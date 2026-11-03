import {reconcileObserved} from './monitor-report.js';
import {currentAssociations} from './monitor-current.js';
import {ensure,find,get,save,records,publicRecord,type Context,type Data,type Definition,type RecordValue} from '@steward/business-kit';
import {canonical,digest} from '@steward/module-sdk';
import {object,identifier} from '@steward/commerce-kit';

const integer=(minimum:number,maximum:number)=>({type:'integer',minimum,maximum});
export const monitoringPolicySchema=object({key:identifier,associationId:identifier,enabled:{type:'boolean'},intervalSeconds:integer(60,86400),batchSize:integer(1,20),graceSeconds:integer(60,604800),freshnessSeconds:integer(60,300),delaySeconds:integer(60,2592000),includePending:{type:'boolean'},collectCosts:{type:'boolean'},includeKnownTest:{type:'boolean'}});
monitoringPolicySchema.required=monitoringPolicySchema.required.filter((k:string)=>k!=='collectCosts');
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
function local(c:Context){ensure(c.providerIdentity&&c.entityId&&!c.peerScope,'Local enrolled monitoring identity required',403);return c.providerIdentity;}
function eligible(d:Data,p:Data){return !d.canceled&&d.financialStatus!=='refunded'&&(d.test!==true||p.includeKnownTest)&&(['paid','partially_refunded'].includes(d.financialStatus)||p.includePending&&['pending','authorized','partially_paid'].includes(d.financialStatus));}
/** Pure condition evaluation. Cached absence is meaningful only within both source leases. */
export function monitoringIssues(order:Data,match:Data|undefined,profile:Data|undefined,p:Data,firstSeen:number,now=Date.now()):Data[]{
 const issues:Data[]=[];const add=(code:string,explanation:string)=>issues.push({code,explanation,severity:'warning'});
 if(!eligible(order,p))return issues;
 const fresh=(s:unknown)=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&Date.parse(s)<=now&&now-Date.parse(s)<=p.freshnessSeconds*1000;
 const r=match?.result,c=r?.connection;
 if(!profile||profile.ordersStatus!=='synced'||!fresh(profile.ordersSyncedAt)){add('source_unavailable','Shopify order observations are stale or unavailable. Check the connection and its last error; absence cannot be inferred.');return issues;}
 if(!match||match.status==='pending'){if(match&&now-Date.parse(match.requestedAt)>300000)add('comparison_timeout','The governed comparison has not completed. Inspect its delivery receipt; no missing-order conclusion is possible.');return issues;}
 if(['unavailable','stale'].includes(match.status)||!r||r.status!=='ok'||!fresh(c?.observedAt)||!c?.expiresAt||Date.parse(c.expiresAt)<=now){add('source_unavailable','Printify observations are stale, incomplete or unavailable. Restore read-only connectivity; absence cannot be inferred.');return issues;}
 if(match.status==='ambiguous'||r.nextOffset!==null){add('comparison_incomplete','Comparison is ambiguous or paginated. Review all source records before drawing a fulfillment conclusion.');return issues;}
 const items=r.items??[];
 if(['pending','authorized','partially_paid'].includes(order.financialStatus)&&items.some((i:Data)=>['in-production','fulfilled','shipped','delivered'].includes(i.status)))add('production_before_payment','Supplier production or fulfillment is observed while customer payment remains pending. Review source payment evidence; no payment is collected by Steward.');
 if(!items.length){if(now-firstSeen>=p.graceSeconds*1000&&!['pending','authorized','partially_paid'].includes(order.financialStatus))add('no_observed_match','No Printify API observation after the local grace period. Check Printify Other orders and product mappings; this does not prove Printify never received the order.');return issues;}
 if(items.some((i:Data)=>['on-hold','payment-not-received'].includes(i.status)))add('production_hold','Printify reports a hold. Review it in Printify; Steward will not submit production or change payment.');
 if(items.some((i:Data)=>['failed','canceled','cancelled'].includes(i.status)))add('production_exception','Printify reports failure or cancellation for an active Shopify order. Review the original provider records.');
 if(now-firstSeen>=p.delaySeconds*1000&&items.some((i:Data)=>!['fulfilled','shipped','delivered','canceled','cancelled'].includes(i.status)))add('production_delayed','Observed production remains incomplete beyond the configured local observation window. Review the provider; no corrective action was executed.');
 if(order.fulfillmentStatus==='FULFILLED'&&items.some((i:Data)=>!['fulfilled','shipped','delivered'].includes(i.status)))add('fulfillment_review','Shopify reports fulfillment while at least one matched Printify record does not. Split orders and line allocation require human review.');
 return issues;
}

/** Reuses the module transaction/tick and durable SSMA outbox. No provider HTTP or scheduler service. */
export function withMonitoringPolicy(def:Definition,request:(c:Context,r:RecordValue)=>Promise<RecordValue>):Definition{
 def.resources.push({kind:'monitor-policy',path:'/monitor-policies',key:'key',schema:monitoringPolicySchema,prepare:async(b,old,c)=>{
  ensure(c.permissions.includes('cee.shopify.configure'),'Monitoring administrator permission required',403);const own=local(c),a=await get(c,'order-association',b.associationId);
  ensure(same(a.data.owner,own)&&(!old||old.data.associationId===b.associationId&&same(old.data.owner,own)),'Original association and installation required',409);
  const duplicate=(await c.db.query("SELECT id FROM business_records WHERE kind='monitor-policy' AND data->>'associationId'=$1 AND key<>$2",[b.associationId,b.key])).rows;
  ensure(!duplicate.length,'Association already has a monitoring policy',409);
  if(b.collectCosts===true)ensure(c.permissions.includes('cee.shopify.cost.read'),'Cost permission required to approve automatic cost reads',403);
  return{...old?.data,...b,collectCosts:b.collectCosts===true,costApprovedBy:b.collectCosts===true?c.actor:null,owner:own,approvedBy:c.actor,approvedAt:new Date().toISOString(),cursor:old?.data.cursor??null,nextRunAt:null};
 }});
 def.actions.push({kind:'commerce-condition',path:'/acknowledge-monitor-condition/:id',permission:'cee.shopify.configure',run:async(r,c)=>{
  ensure(r.data.origin==='order-monitoring'&&same(r.data.owner,local(c)),'Original local monitoring condition required',403);
  const m=await get(c,'order-match',r.data.sourceId);ensure((await currentAssociations(c)).has(m.data.associationId),'Historical condition is read-only',409);
  const changed=r.data.acknowledgedAt?r:await save(c,r.kind,r.key,{...r.data,acknowledgedAt:new Date().toISOString(),acknowledgedBy:c.actor},r);return{record:publicRecord(changed)};
 }});
 const conditionQuery=async(c:Context,q:Record<string,string>={},history=false)=>{
  const limit=Number(q.limit??20),offset=Number(q.offset??0);ensure(Number.isInteger(limit)&&limit>0&&limit<=20&&Number.isInteger(offset)&&offset>=0&&offset<=100000,'Invalid page');
  if(q.recordId)ensure(/^[0-9a-f-]{36}$/i.test(q.recordId),'Invalid order reference');const active=await currentAssociations(c),matches=new Map((await records(c,'order-match')).map(m=>[m.id,m]));
  const rows=(await records(c,'commerce-condition')).filter(r=>r.data.origin==='order-monitoring'&&(!q.recordId||r.data.sourceRecordId===q.recordId)).flatMap(r=>{const m=matches.get(r.data.sourceId),current=!!m&&active.has(m.data.associationId)&&same(r.data.owner,local(c));return current===!history?[{...publicRecord(r),historical:!current,current,status:current?r.data.status:'historical',originalStatus:r.data.status}]:[];});
  return{records:rows.slice(offset,offset+limit),nextOffset:offset+limit<rows.length?offset+limit:null};
 };
 def.queries??=[];def.queries.push({path:'/monitor-conditions',run:(c,q)=>conditionQuery(c,q)},{path:'/historical-conditions',run:(c,q)=>conditionQuery(c,q,true)});
 const tick=def.tick;def.tick=async c=>{await tick?.(c);if(!c.providerIdentity||!c.entityId||c.peerScope||!c.config.integrationsEnabled)return;
  const now=Date.now();const policies=(await c.db.query("SELECT * FROM business_records WHERE kind='monitor-policy' AND data->>'enabled'='true' AND data->'owner'=$1::jsonb ORDER BY updated_at,id LIMIT 20",[JSON.stringify(local(c))])).rows as RecordValue[];
  for(const policy of policies){const p=policy.data;if(p.nextRunAt&&Date.parse(p.nextRunAt)>now)continue;
   const a=await get(c,'order-association',p.associationId);if(!same(a.data.owner,local(c)))continue;
   const rows=(await c.db.query("SELECT * FROM business_records WHERE kind='order' AND data->>'connectionId'=$1 AND ($2::uuid IS NULL OR id>$2::uuid) ORDER BY id LIMIT $3",[a.data.shopifyConnectionId,p.cursor,p.batchSize+1])).rows as RecordValue[];
   const profile=await find(c,'live-connection',a.data.shopifyConnectionId);
   for(const o of rows.slice(0,p.batchSize)){
    const simulation=c.simulation;try{
    const key=digest(canonical([a.id,o.data.remoteSourceId]));let m=await find(c,'order-match',key);
    if(!m){const existing=(await c.db.query("SELECT * FROM business_records WHERE kind='order-match' AND data->>'associationId'=$1 AND data->>'orderId'=$2 AND (data->>'offset'='0' OR data->>'policyId'=$4) AND data->'owner'=$3::jsonb ORDER BY created_at,id LIMIT 1",[a.id,o.id,JSON.stringify(local(c)),policy.id])).rows[0] as RecordValue|undefined;if(existing)m=existing.data.policyId?existing:await save(c,existing.kind,existing.key,{...existing.data,policyId:policy.id,firstSeenAt:new Date(now).toISOString()},existing);}
    if(!m&&eligible(o.data,p))m=await save(c,'order-match',key,{associationId:a.id,orderId:o.id,offset:0,owner:local(c),status:'draft',firstSeenAt:new Date(now).toISOString(),policyId:policy.id});
    if(!m)continue;
    const issues=p.enabled?monitoringIssues(o.data,m.data,profile?.data,p,Date.parse(m.data.firstSeenAt),now):[];
    if(m.data.totalStatus==='complete'){const costs=await find(c,'order-total-read',m.id);const reconciled=reconcileObserved(o,m,costs?.data.result,profile?.data);if(reconciled.costCoverage==='incomplete')issues.push({code:'financial_evidence_incomplete',severity:'warning',explanation:'Retrieved supplier cost evidence cannot establish complete same-currency order totals. Review the original records; no profit is inferred.'});}
    const active=new Set(issues.map(i=>i.code));
    for(const issue of issues){const ck=digest(m.id+':'+issue.code),old=await find(c,'commerce-condition',ck);
     if(!old||!old.data.active)await save(c,'commerce-condition',ck,{contractVersion:1,origin:'order-monitoring',owner:local(c),approved:old?.data.approved===true,active:true,status:'active',sourceId:m.id,order:o.key,...issue,episode:(old?.data.episode??0)+1,openedAt:new Date(now).toISOString(),acknowledgedAt:null,acknowledgedBy:null,sourceRecordId:o.id,sourceRevision:o.revision,observedAt:m.data.result?.connection?.observedAt??null,providerPin:a.data.providerPin},old);
    }
    const conditions=(await c.db.query("SELECT * FROM business_records WHERE kind='commerce-condition' AND data->>'origin'='order-monitoring' AND data->>'sourceId'=$1 AND data->>'active'='true'",[m.id])).rows as RecordValue[];
    // Unavailable data cannot resolve a previously observed business exception.
    const uncertain=issues.some(i=>['source_unavailable','comparison_timeout'].includes(i.code))||m.data.status==='pending';
    for(const old of conditions)if(!active.has(old.data.code)&&!uncertain)await save(c,old.kind,old.key,{...old.data,active:false,status:'resolved',resolvedAt:new Date(now).toISOString()},old);
    if(!eligible(o.data,p))continue;
    if(m.data.status==='pending'&&now-Date.parse(m.data.requestedAt)<300000)continue;
    if(m.data.retryAt&&Date.parse(m.data.retryAt)>now)continue;
    const failures=['unavailable','stale'].includes(m.data.status)?Math.min((m.data.failures??0)+1,8):0;
    m=await save(c,m.kind,m.key,{...m.data,status:m.data.status==='pending'?'unavailable':m.data.status,failures,retryAt:new Date(now+Math.min(p.intervalSeconds*2**failures,86400)*1000).toISOString()},m);
    await request(c,m);
    }finally{if(simulation)c.simulation=simulation;else delete c.simulation;}
   }
   await save(c,policy.kind,policy.key,{...p,cursor:rows.length>p.batchSize?rows[p.batchSize-1]!.id:null,nextRunAt:new Date(now+(rows.length>p.batchSize?30:p.intervalSeconds)*1000).toISOString(),lastRunAt:new Date(now).toISOString()},policy);
  }
 };return def;
}
