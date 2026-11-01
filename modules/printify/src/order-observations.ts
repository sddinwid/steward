import {ensure,type Context,type Data,type Definition} from '@steward/business-kit';
import {canonical,digest,validateCapabilityValue,type IntegrationCommand} from '@steward/module-sdk';
import {orderReadCapabilityId,orderReadOperations} from '@steward/commerce-kit';
export async function orderConnections(ctx:Context){
 const rows=(await ctx.db.query("SELECT b.key,b.data,s.status,s.observed_at FROM business_records b LEFT JOIN printify_order_sync s ON s.connection_id=b.key WHERE b.kind='connector-identity' ORDER BY b.key LIMIT 101")).rows;ensure(rows.length<=100,'Order connection bound exceeded',413);
 return rows.map(r=>{const observedAt=r.observed_at?new Date(r.observed_at).toISOString():null,expiresAt=observedAt?new Date(Date.parse(observedAt)+300000).toISOString():null;return{connectionId:r.key,accountId:String(r.data.shopId),mode:r.data.mode,originDigest:digest(canonical(r.data)),state:r.data.mode!==ctx.config.mode||!r.status?'unavailable':r.status!=='ready'?r.status:!expiresAt||Date.parse(expiresAt)<=Date.now()?'stale':'ready',observedAt,expiresAt};});
}
export async function orderObservationsReceive(command:IntegrationCommand,ctx:Context):Promise<Data|null>{
 const op=orderReadOperations.find(o=>o.name===command.command);if(!op)return null;
 const p=ctx.providerIdentity,c=ctx.incomingProviderIdentity;ensure(p&&c&&!ctx.peerScope&&p.moduleId==='cee.printify'&&p.workerInstallationId===ctx.installationId&&p.entityId===ctx.entityId&&c.workerInstallationId===ctx.installationId&&c.entityId===ctx.entityId&&c.moduleId===command.sourceModuleId&&command.capability?.capabilityId===orderReadCapabilityId,'Local order observation authority required',403);validateCapabilityValue(command.payload,op.input);
 const b=command.payload as Data,connections=await orderConnections(ctx);let result:Data;
 if(command.command==='order-observations.connections')result={contractVersion:1,connections:connections.slice(b.offset,b.offset+b.limit),nextOffset:b.offset+b.limit<connections.length?b.offset+b.limit:null};
 else{const connection=connections.find(c=>c.connectionId===b.connectionId);ensure(connection&&connection.accountId===b.accountId&&connection.originDigest===b.originDigest,'Original order store identity changed',409);let items:Data[]=[],nextOffset=null,status=connection.state==='ready'?'ok':connection.state;
 if(status==='ok'){const rows=(await ctx.db.query("SELECT b.* FROM business_records b JOIN printify_order_sync s ON s.connection_id=$1 WHERE b.kind='external-order' AND b.data->>'connectionId'=$1 AND b.data->>'shopOrderId'=$2 AND s.order_ids ? (b.data->>'remoteSourceId') ORDER BY b.key LIMIT $3 OFFSET $4",[b.connectionId,b.shopOrderId,b.limit+1,b.offset])).rows;nextOffset=rows.length>b.limit?b.offset+b.limit:null;items=rows.slice(0,b.limit).map(r=>({sourceRecordId:r.id,sourceStreamId:'printify_order_observations_v1',sourceRevision:Number(r.revision),remoteOrderId:r.data.remoteSourceId,shopOrderId:r.data.shopOrderId,status:r.data.status,tracking:r.data.tracking??[],currency:r.data.currency??null}));}
 result={contractVersion:1,connection,status,shopOrderId:b.shopOrderId,items,nextOffset};}
 validateCapabilityValue(result,op.output);return result;
}
export function withOrderObservations(def:Definition):Definition{const old=def.receive;return{...def,receive:async(command,ctx)=>{const r=await orderObservationsReceive(command,ctx);if(r)return r;ensure(old,'Unsupported operation',403);return old(command,ctx);}};}
