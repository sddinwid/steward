/** Versioned aggregate-only GA4 evidence. No visitor identities or raw URLs. */
export const MARKETING_STREAM='marketing_reports_v1';
export const MARKETING_EVENTS=['view_item','add_to_cart','begin_checkout','purchase'] as const;
export interface MarketingSnapshot {
 contractVersion:1;propertyId:string;storeOrigin:string;kind:'traffic'|'events';from:string;to:string;
 timezone:string;currency:string;retrievedAt:string;expiresAt:string;complete:boolean;
 qualifications:string[];rows:{date:string;dimension:string;count:number}[];reportDigest:string;
}
const date=(s:unknown)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function marketingRange(from:string,to:string){if(!date(from)||!date(to)||Date.parse(to)<Date.parse(from)||Date.parse(to)-Date.parse(from)>30*86400000)throw Error('MARKETING_PERIOD_INVALID');}
export function marketingOrigin(value:string){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||u.pathname!=='/'||!u.hostname.includes('.')||u.hostname==='localhost'||/^[\d.]+$/.test(u.hostname))throw Error('MARKETING_STORE_ORIGIN_INVALID');return u.origin;}
export function validateMarketingSnapshot(value:unknown):asserts value is MarketingSnapshot{
 const s=value as MarketingSnapshot;if(!s||typeof s!=='object'||Object.keys(s).sort().join()!==['contractVersion','propertyId','storeOrigin','kind','from','to','timezone','currency','retrievedAt','expiresAt','complete','qualifications','rows','reportDigest'].sort().join()||s.contractVersion!==1||typeof s.propertyId!=='string'||!/^\d{1,15}$/.test(s.propertyId)||!['traffic','events'].includes(s.kind)||typeof s.complete!=='boolean'||!Array.isArray(s.qualifications)||s.qualifications.length>10||s.qualifications.some(q=>!['thresholded','sampled','other-row-loss','schema-restricted','pagination-limit','metadata-missing','provider-truncation','provider-empty-reason'].includes(q))||s.complete!==!s.qualifications.length)throw Error('MARKETING_SNAPSHOT_INVALID');
 marketingRange(s.from,s.to);if(marketingOrigin(s.storeOrigin)!==s.storeOrigin||!/^([A-Z]{3}|UNKNOWN)$/.test(s.currency)||typeof s.timezone!=='string'||s.timezone.length>80||!Number.isFinite(Date.parse(s.retrievedAt))||!Number.isFinite(Date.parse(s.expiresAt))||Date.parse(s.expiresAt)<=Date.parse(s.retrievedAt)||Date.parse(s.expiresAt)-Date.parse(s.retrievedAt)>172800000||!/^[a-f0-9]{64}$/.test(s.reportDigest)||!Array.isArray(s.rows)||s.rows.length>1000)throw Error('MARKETING_SNAPSHOT_INVALID');
 if(s.timezone==='UNKNOWN'){if(!s.qualifications.includes('metadata-missing'))throw Error('MARKETING_TIMEZONE_INVALID');}else{try{new Intl.DateTimeFormat('en',{timeZone:s.timezone}).format(0);}catch{throw Error('MARKETING_TIMEZONE_INVALID');}}
 const keys=new Set<string>();for(const r of s.rows){const k=r.date+':'+r.dimension;if(!r||Object.keys(r).sort().join()!=='count,date,dimension'||!date(r.date)||r.date<s.from||r.date>s.to||!Number.isSafeInteger(r.count)||r.count<0||keys.has(k)||typeof r.dimension!=='string'||(s.kind==='events'?!MARKETING_EVENTS.includes(r.dimension as any):!/^[A-Za-z -]{1,60}$/.test(r.dimension)))throw Error('MARKETING_ROWS_INVALID');keys.add(k);}
}
export function marketingComparison(before:MarketingSnapshot,after:MarketingSnapshot,now=Date.now()){
 validateMarketingSnapshot(before);validateMarketingSnapshot(after);
 const compatible=before.propertyId===after.propertyId&&before.storeOrigin===after.storeOrigin&&before.kind===after.kind&&before.timezone===after.timezone&&before.currency===after.currency&&before.to<after.from&&Date.parse(before.to)-Date.parse(before.from)===Date.parse(after.to)-Date.parse(after.from);
 const usable=compatible&&[before,after].every(s=>s.complete&&Date.parse(s.expiresAt)>now&&Date.parse(s.retrievedAt)<=now);
 const sum=(s:MarketingSnapshot)=>{const n=s.rows.reduce((a,r)=>a+BigInt(r.count),0n);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('MARKETING_COUNT_OVERFLOW');return Number(n);};
 const a=usable?sum(before):null,b=usable?sum(after):null;
 const ratio=a!==null&&a>0?(BigInt(b!-a)*10000n)/BigInt(a):null;
 return{contractVersion:1,compatible,complete:usable,metric:after.kind==='traffic'?'reported sessions':'tracked ecommerce event occurrences',before:a,after:b,change:usable?b!-a!:null,changeBasisPoints:ratio!==null&&ratio<=BigInt(Number.MAX_SAFE_INTEGER)&&ratio>=BigInt(-Number.MAX_SAFE_INTEGER)?Number(ratio):null,limitations:['Aggregate reporting is not a sequential funnel or causal attribution.','No advertising spend, ROAS, CAC, settlement or profit is established.'],decisionExecuted:false};
}
