import type {Data} from '@steward/business-kit';
/** Pages may be combined only from the same provider snapshot; a moving snapshot restarts safely. */
export function monitoringPage(previous:Data|undefined,body:Data,offset:number){
 if(body.status!=='ok')return{result:body,offset:0,status:body.status};
 if(offset>0&&(!previous||previous.nextOffset!==offset||previous.connection.observedAt!==body.connection.observedAt))return{result:body,offset:0,status:'stale'};
 const items=offset>0?[...previous!.items,...body.items]:body.items;
 if(items.length>1000||new Set(items.map((i:Data)=>i.remoteOrderId)).size!==items.length)return{result:body,offset:0,status:'ambiguous'};
 if(body.nextOffset!==null&&body.nextOffset<=offset)return{result:body,offset:0,status:'ambiguous'};
 return{result:{...body,items},offset:body.nextOffset??0,status:body.nextOffset!==null?'incomplete':items.length?'matched':'no_observed_match',...(body.nextOffset!==null?{retryAt:null}:{})};
}
