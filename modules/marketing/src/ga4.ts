import {readFile} from 'node:fs/promises';
import {request} from 'node:https';
import {createPrivateKey,sign,createHash} from 'node:crypto';
import {boundedLookup,canonical,digest} from '@steward/module-sdk';
import {MARKETING_EVENTS,marketingRange,marketingOrigin,validateMarketingSnapshot,type MarketingSnapshot} from '@steward/module-sdk/marketing';
export class Ga4Error extends Error{constructor(public code:string,public transient=false){super(code);}}
type Json=Record<string,any>;
export interface GoogleCredential {propertyId:string;storeOrigin:string;serviceAccount:{client_email:string;private_key:string;type:string;token_uri:string}}
export type GoogleTransport=(path:string,body:Json,token?:string)=>Promise<Json>;
export const googleTransport:GoogleTransport=(path,body,token)=>new Promise((resolve,reject)=>{
 const oauth=path==='token';if(oauth&&token)return reject(new Ga4Error('GA4_ENDPOINT_FORBIDDEN'));if(!oauth&&!/^properties\/\d{1,15}:(runReport|checkCompatibility)$/.test(path))return reject(new Ga4Error('GA4_ENDPOINT_FORBIDDEN'));
 const url=oauth?'https://oauth2.googleapis.com/token':'https://analyticsdata.googleapis.com/v1beta/'+path;
 const data=oauth?new URLSearchParams(body).toString():JSON.stringify(body);
 const req=request(url,{method:'POST',lookup:boundedLookup,rejectUnauthorized:true,signal:AbortSignal.timeout(12000),headers:{'content-type':oauth?'application/x-www-form-urlencoded':'application/json','content-length':Buffer.byteLength(data),...(token?{authorization:'Bearer '+token}:{})}},res=>{
  let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;if(Buffer.byteLength(text)>1048576)req.destroy();});res.on('end',()=>{
   if(res.statusCode===429)return reject(new Ga4Error('GA4_RATE_LIMITED',true));if(!res.statusCode||res.statusCode>=500)return reject(new Ga4Error('GA4_UNAVAILABLE',true));
   if(res.statusCode===401||res.statusCode===403)return reject(new Ga4Error('GA4_PERMISSION_DENIED'));
   if(res.statusCode!==200)return reject(new Ga4Error(oauth?'GA4_CREDENTIAL_REJECTED':'GA4_REPORT_REJECTED'));
   try{resolve(JSON.parse(text));}catch{reject(new Ga4Error('GA4_RESPONSE_INVALID'));}
  });
 });req.on('error',()=>reject(new Ga4Error('GA4_UNAVAILABLE',true)));req.end(data);
});
export async function loadCredential(file='/run/module-secrets/connector.json'):Promise<GoogleCredential>{
 let v:Json;try{const raw=await readFile(file,'utf8');if(Buffer.byteLength(raw)>32768)throw Error();v=JSON.parse(raw);}catch{throw new Ga4Error('GA4_PRIVATE_FILE_REQUIRED');}
 const a=v.serviceAccount;
 if(v.version!==1||v.provider!=='ga4'||!/^\d{1,15}$/.test(v.propertyId)||typeof v.storeOrigin!=='string'||!a||a.type!=='service_account'||!/^[-a-z0-9]+@[-a-z0-9]+\.iam\.gserviceaccount\.com$/.test(a.client_email)||a.token_uri!=='https://oauth2.googleapis.com/token'||typeof a.private_key!=='string')throw new Ga4Error('GA4_PRIVATE_CONFIGURATION_INVALID');
 try{marketingOrigin(v.storeOrigin);const k=createPrivateKey(a.private_key);if(k.asymmetricKeyType!=='rsa'||(k.asymmetricKeyDetails?.modulusLength??0)<2048)throw Error();}catch{throw new Ga4Error('GA4_PRIVATE_CONFIGURATION_INVALID');}return v as GoogleCredential;
}
export interface Ga4Authentication {token(credential:GoogleCredential):Promise<string>;invalidate():void}
export function serviceAccountAuth(send:GoogleTransport=googleTransport,clock=()=>Date.now()):Ga4Authentication{
 let cache:{fingerprint:string;value:string;expires:number}|undefined;
 return{invalidate(){cache=undefined;},async token(c){const fingerprint=createHash('sha256').update(c.serviceAccount.private_key+c.serviceAccount.client_email).digest('hex');if(cache?.fingerprint===fingerprint&&cache.expires>clock()+60000)return cache.value;
  const now=Math.floor(clock()/1000),enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url'),input=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:c.serviceAccount.client_email,scope:'https://www.googleapis.com/auth/analytics.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const assertion=input+'.'+sign('RSA-SHA256',Buffer.from(input),c.serviceAccount.private_key).toString('base64url');
  const r=await send('token',{grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion});if(typeof r.access_token!=='string'||!r.access_token.length||r.access_token.length>8192||r.token_type?.toLowerCase()!=='bearer'||!Number.isInteger(r.expires_in)||r.expires_in<60||r.expires_in>3600)throw new Ga4Error('GA4_TOKEN_INVALID');cache={fingerprint,value:r.access_token,expires:clock()+r.expires_in*1000};return cache.value;
 }};
}
const channels=new Set(['Direct','Organic Search','Paid Search','Organic Social','Paid Social','Email','Affiliates','Referral','Paid Other','Organic Video','Paid Video','Display','Cross-network','Organic Shopping','Paid Shopping','Audio','SMS','Mobile Push Notifications','Unassigned']);
export function ga4Client(send:GoogleTransport=googleTransport,auth:Ga4Authentication=serviceAccountAuth(send)){
 return{async report(c:GoogleCredential,kind:'traffic'|'events',from:string,to:string):Promise<MarketingSnapshot>{
  marketingRange(from,to);const token=await auth.token(c),dimensions=[{name:'date'},{name:kind==='traffic'?'sessionDefaultChannelGroup':'eventName'}],metrics=[{name:kind==='traffic'?'sessions':'eventCount'}];
  const call=async(op:string,b:Json)=>{try{return await send('properties/'+c.propertyId+':'+op,b,token);}catch(e){if(e instanceof Ga4Error&&e.code==='GA4_PERMISSION_DENIED')auth.invalidate();throw e;}};
  const compatible=await call('checkCompatibility',{dimensions,metrics});
  if(!dimensions.every(d=>compatible.dimensionCompatibilities?.some((x:Json)=>x.dimensionMetadata?.apiName===d.name&&x.compatibility==='COMPATIBLE'))||!metrics.every(m=>compatible.metricCompatibilities?.some((x:Json)=>x.metricMetadata?.apiName===m.name&&x.compatibility==='COMPATIBLE')))throw new Ga4Error('GA4_REPORT_INCOMPATIBLE');
  const rows:MarketingSnapshot['rows']=[],qualifications=new Set<string>();let timezone='UNKNOWN',currency='UNKNOWN',expected:number|undefined;
  for(let offset=0;offset<1000;offset+=250){
   const r=await call('runReport',{dateRanges:[{startDate:from,endDate:to}],dimensions,metrics,limit:250,offset,orderBys:dimensions.map(d=>({dimension:{dimensionName:d.name}})),...(kind==='events'?{dimensionFilter:{filter:{fieldName:'eventName',inListFilter:{values:[...MARKETING_EVENTS],caseSensitive:true}}}}:{})});
   // Protobuf JSON omits default scalar fields: an absent rowCount means zero.
   // Explicit null/invalid counts and nonempty rows with an omitted count still fail validation.
   if(!Object.hasOwn(r,'rowCount'))r.rowCount=0;
   if(r.dimensionHeaders?.map((v:Json)=>v.name).join()!==dimensions.map(v=>v.name).join()||r.metricHeaders?.map((v:Json)=>v.name).join()!==metrics.map(v=>v.name).join()||!Number.isSafeInteger(r.rowCount)||r.rowCount<0||!Array.isArray(r.rows??[]))throw new Ga4Error('GA4_RESPONSE_INVALID');
   if(expected!==undefined&&expected!==r.rowCount)throw new Ga4Error('GA4_REPORT_CHANGED',true);expected=r.rowCount;if((r.rows??[]).length>250||rows.length+(r.rows??[]).length>r.rowCount)throw new Ga4Error('GA4_RESPONSE_INVALID');
   const meta=r.metadata??{};if(!meta.timeZone||!meta.currencyCode)qualifications.add('metadata-missing');
   const tz=meta.timeZone??'UNKNOWN',cur=meta.currencyCode??'UNKNOWN';if(offset&&(tz!==timezone||cur!==currency))throw new Ga4Error('GA4_REPORT_CHANGED',true);timezone=tz;currency=cur;
   if(meta.dataTruncationReasons?.length)qualifications.add('provider-truncation');if(meta.emptyReason)qualifications.add('provider-empty-reason');if(meta.subjectToThresholding)qualifications.add('thresholded');if(meta.samplingMetadatas?.length)qualifications.add('sampled');if(meta.dataLossFromOtherRow)qualifications.add('other-row-loss');if(meta.schemaRestrictionResponse?.activeMetricRestrictions?.length)qualifications.add('schema-restricted');
   for(const row of r.rows??[]){const day=row.dimensionValues?.[0]?.value,dimension=row.dimensionValues?.[1]?.value,n=row.metricValues?.[0]?.value;if(!/^\d{8}$/.test(day)||!/^\d+$/.test(n)||!Number.isSafeInteger(Number(n))||(kind==='traffic'?!channels.has(dimension):!MARKETING_EVENTS.includes(dimension)))throw new Ga4Error('GA4_RESPONSE_INVALID');rows.push({date:day.slice(0,4)+'-'+day.slice(4,6)+'-'+day.slice(6),dimension,count:Number(n)});}
   if(rows.length>=r.rowCount)break;if(!(r.rows??[]).length)throw new Ga4Error('GA4_RESPONSE_INVALID');if(offset===750)qualifications.add('pagination-limit');
  }
  const retrievedAt=new Date().toISOString(),value:MarketingSnapshot={contractVersion:1,propertyId:c.propertyId,storeOrigin:c.storeOrigin,kind,from,to,timezone,currency,retrievedAt,expiresAt:new Date(Date.parse(retrievedAt)+86400000).toISOString(),complete:!qualifications.size,qualifications:[...qualifications].sort(),rows,reportDigest:digest(canonical({kind,from,to,timezone,currency,rows,qualifications:[...qualifications].sort()}))};validateMarketingSnapshot(value);return value;
 }};
}
