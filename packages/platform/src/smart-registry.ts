/** Bound real provider inspections while retaining their original signed declaration order. */
export const REGISTRY_INSPECTION_CONCURRENCY=8;
export async function boundedRegistryMap<T,U>(values:readonly T[],work:(value:T,index:number)=>Promise<U>,limit=REGISTRY_INSPECTION_CONCURRENCY):Promise<U[]>{
 if(!Number.isInteger(limit)||limit<1||limit>REGISTRY_INSPECTION_CONCURRENCY)throw Error('Invalid registry inspection bound');
 const result:U[]=new Array(values.length);let cursor=0;
 const workers=Array.from({length:Math.min(limit,values.length)},async()=>{for(;;){const index=cursor++;if(index>=values.length)return;result[index]=await work(values[index]!,index);}});
 // A failed scan must retain its slot until every already-started inspection finishes.
 const settled=await Promise.allSettled(workers),failed=settled.find(r=>r.status==='rejected');
 if(failed?.status==='rejected')throw failed.reason;
 return result;
}
/** Share only an in-flight fresh scan; completed provider health is never cached here. */
export function singleRegistryFlight<T>(scan:()=>Promise<T>):()=>Promise<T>{
 let current:Promise<T>|undefined;
 return()=>current??(current=Promise.resolve().then(scan).finally(()=>{current=undefined;}));
}
