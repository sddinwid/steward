import {ConnectorError} from '@steward/commerce-kit';
import type {Data} from '@steward/business-kit';
const transient=new Set(['CONNECTOR_UNAVAILABLE','CONNECTOR_RATE_LIMITED']);
export function liveOperation(d:Data,enabled:boolean,now=Date.now()):'catalog'|'test'|null{
 if(d.requestedOperation==='catalog'||d.requestedOperation==='test')return d.requestedOperation;
 if(!enabled||!d.syncedAt)return null;
 if(d.status==='synced'&&now-Date.parse(d.syncedAt)>=60000)return 'catalog';
 if(d.status==='connection_unavailable'&&d.recoveryStatus==='retry_scheduled'&&transient.has(d.error)&&Number.isFinite(Date.parse(d.nextRetryAt))&&Date.parse(d.nextRetryAt)<=now)return 'catalog';
 // Retained successful profiles from before retry metadata existed can recover once safely.
 if(d.status==='connection_unavailable'&&d.recoveryStatus===undefined&&transient.has(d.error))return 'catalog';
 return null;
}
export function liveFailure(d:Data,error:unknown,operation:string,now=Date.now()){
 const code=error instanceof ConnectorError?error.code:typeof (error as any)?.message==='string'&&/^[A-Z_]+$/.test((error as any).message)?(error as any).message:'SHOPIFY_CONNECTION_TEST_FAILED';
 const retry=operation==='catalog'&&!!d.syncedAt&&transient.has(code);
 const retryAttempts=retry?Math.min((Number.isSafeInteger(d.retryAttempts)?d.retryAttempts:0)+1,10):0;
 return{error:code,retryAttempts,nextRetryAt:retry?new Date(now+Math.min(60000*2**(retryAttempts-1),900000)).toISOString():null,recoveryStatus:retry?'retry_scheduled':'manual_review_required'};
}
