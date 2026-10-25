import {readFile} from 'node:fs/promises';
import {request} from 'node:https';
import {createHmac,timingSafeEqual,randomBytes,createHash} from 'node:crypto';
import {boundedLookup} from '@steward/module-sdk';
import {ConnectorError,connectorConnections,SHOPIFY_API_VERSION} from '@steward/commerce-kit';
import {ensure,type Data} from '@steward/business-kit';
export type ShopifyTransport=(url:URL,body:Data,headers:Record<string,string>)=>Promise<Data>;
export const shopDomain=(value:unknown):string=>{ensure(typeof value==='string'&&value.length<=253&&/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value),'SHOPIFY_SHOP_DOMAIN_INVALID',400);return value;};
export async function loadShopifyConnections(mode:string,file='/run/module-secrets/connector.json'):Promise<Data[]>{
 if(mode!=='live')return connectorConnections('shopify',mode,file);
 let raw:Data;try{raw=JSON.parse(await readFile(file,'utf8'));}catch{throw new ConnectorError('CONNECTOR_CONFIGURATION_REQUIRED');}
 const rows:Data[]=raw.version===2?raw.connections:[{...raw,connectionId:'default'}];ensure(Array.isArray(rows)&&rows.length>0&&rows.length<=10,'SHOPIFY_CONNECTION_BUNDLE_INVALID',503);
 ensure(new Set(rows.map(s=>s.connectionId)).size===rows.length&&new Set(rows.map(s=>s.shopDomain)).size===rows.length,'SHOPIFY_CONNECTION_IDENTITIES_DUPLICATED',503);
 return rows.map(s=>{const domain=shopDomain(s.shopDomain);ensure(s.provider==='shopify'&&s.mode==='live'&&/^[a-z][a-z0-9-]{0,39}$/.test(s.connectionId)&&(!s.baseUrl||s.baseUrl==='https://'+domain+'/'),'SHOPIFY_CONNECTION_TRUST_INVALID',503);
  const auth=s.auth;ensure(auth?.grantType==='client_credentials'&&typeof auth.clientId==='string'&&/^[a-zA-Z0-9_-]{8,128}$/.test(auth.clientId)&&typeof auth.clientSecret==='string'&&auth.clientSecret.length>=24&&auth.clientSecret.length<=512,'SHOPIFY_CLIENT_CREDENTIALS_REQUIRED',503);
  ensure(!s.shopId||/^gid:\/\/shopify\/Shop\/\d+$/.test(s.shopId),'SHOPIFY_EXPECTED_STORE_ID_INVALID',503);
  return {...s,baseUrl:'https://'+domain+'/',webhookSecret:auth.clientSecret};});
}
// Fixed official HTTPS origin, no redirects/proxies/custom CA, bounded response and time. Error bodies never escape.
export function makeShopifyTransport(send:typeof request=request):ShopifyTransport{return (url,body,headers)=>new Promise((resolve,reject)=>{
 const domain=shopDomain(url.hostname);ensure(url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash&&url.hostname===domain,'SHOPIFY_ENDPOINT_INVALID',503);
 ensure(['/admin/oauth/access_token','/admin/api/'+SHOPIFY_API_VERSION+'/graphql.json'].includes(url.pathname),'SHOPIFY_ENDPOINT_INVALID',503);
 const form=url.pathname==='/admin/oauth/access_token',data=form?new URLSearchParams(Object.entries(body).map(([k,v])=>[k,String(v)])).toString():JSON.stringify(body),req=send(url,{method:'POST',lookup:boundedLookup,rejectUnauthorized:true,timeout:8000,signal:AbortSignal.timeout(9000),headers:{'content-type':form?'application/x-www-form-urlencoded':'application/json','content-length':Buffer.byteLength(data),...headers}},res=>{let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;if(Buffer.byteLength(text)>524288)req.destroy();});res.on('end',()=>{
  if(res.statusCode===401||res.statusCode===403)return reject(new ConnectorError('SHOPIFY_AUTHENTICATION_OR_SCOPE_REJECTED'));
  if(res.statusCode===429)return reject(new ConnectorError('CONNECTOR_RATE_LIMITED',true));if(!res.statusCode||res.statusCode>=500)return reject(new ConnectorError('CONNECTOR_UNAVAILABLE',true));if(res.statusCode>=300)return reject(new ConnectorError('SHOPIFY_REQUEST_REJECTED'));
  if(url.pathname.endsWith('graphql.json')&&res.headers['x-shopify-api-version']!==SHOPIFY_API_VERSION)return reject(new ConnectorError('SHOPIFY_API_VERSION_MISMATCH'));
  try{const parsed=JSON.parse(text);if(parsed.errors?.length)return reject(new ConnectorError(parsed.errors.some((e:Data)=>e.extensions?.code==='THROTTLED')?'CONNECTOR_RATE_LIMITED':'SHOPIFY_GRAPHQL_REJECTED',parsed.errors.some((e:Data)=>e.extensions?.code==='THROTTLED')));resolve(parsed);}catch{reject(new ConnectorError('CONNECTOR_MALFORMED_RESPONSE'));}
 });});req.on('error',()=>reject(new ConnectorError('CONNECTOR_UNAVAILABLE',true)));req.on('timeout',()=>req.destroy());req.end(data);
});}
export const shopifyTransport=makeShopifyTransport();
export interface ShopifyToken {accessToken:string;expiresAt:number;scopes:string[];refreshToken?:string;refreshExpiresAt?:number}
export function tokenResponse(raw:Data,now=Date.now(),refresh=false):ShopifyToken{
 ensure(typeof raw.access_token==='string'&&raw.access_token.length>=16&&raw.access_token.length<=4096&&!/[\x00-\x20\x7f]/.test(raw.access_token)&&Number.isInteger(raw.expires_in)&&raw.expires_in>60&&raw.expires_in<=86400&&typeof raw.scope==='string','SHOPIFY_TOKEN_RESPONSE_INVALID',503);
 const scopes=raw.scope.split(',').map((x:string)=>x.trim()).filter(Boolean);ensure(scopes.includes('read_products')||scopes.includes('write_products'),'SHOPIFY_READ_PRODUCTS_SCOPE_REQUIRED',403);
 if(refresh)ensure(typeof raw.refresh_token==='string'&&raw.refresh_token.length>=16&&Number.isSafeInteger(raw.refresh_token_expires_in)&&raw.refresh_token_expires_in>60&&raw.refresh_token_expires_in<=7776000,'SHOPIFY_REFRESH_TOKEN_RESPONSE_INVALID',503);
 return {accessToken:raw.access_token,expiresAt:now+raw.expires_in*1000,scopes,...(refresh?{refreshToken:raw.refresh_token,refreshExpiresAt:now+raw.refresh_token_expires_in*1000}:{})};
}
// Per-process expiry cache is deliberately ephemeral: organization-owned stores can reacquire without user login.
// Future merchant installation supplies this same interface from a durable encrypted offline-token repository.
export interface ShopifyTokenProvider {get(secret:Data):Promise<ShopifyToken>;invalidate?(secret:Data):void}
export function clientCredentialsProvider(transport:ShopifyTransport=shopifyTransport,clock=()=>Date.now()):ShopifyTokenProvider{
 const cache=new Map<string,ShopifyToken>(),pending=new Map<string,Promise<ShopifyToken>>(),fingerprint=(s:Data)=>createHash('sha256').update(s.shopDomain+'\0'+s.auth.clientId+'\0'+s.auth.clientSecret).digest('hex');return {invalidate(s){cache.delete(fingerprint(s));},async get(s){const key=fingerprint(s),old=cache.get(key);if(old&&old.expiresAt>clock()+60000)return old;if(pending.has(key))return pending.get(key)!;
  const result=(async()=>{const raw=await transport(new URL('/admin/oauth/access_token',s.baseUrl),{grant_type:'client_credentials',client_id:s.auth.clientId,client_secret:s.auth.clientSecret},{});const value=tokenResponse(raw,clock());if(cache.size>=10)cache.clear();cache.set(key,value);return value;})();pending.set(key,result);try{return await result;}finally{pending.delete(key);}
 }};
}
// Standalone future-customer OAuth protocol boundary; the host must persist and atomically consume state,
// bind it to its authenticated browser/installation, and durably encrypt/serialize refresh-token rotation.
export function oauthAuthorization(s:Data,redirectUri:string,state=randomBytes(32).toString('base64url')){
 shopDomain(s.shopDomain);const redirect=new URL(redirectUri);ensure(redirect.protocol==='https:'&&!redirect.username&&!redirect.password&&!redirect.hash&&!redirect.search,'SHOPIFY_OAUTH_REDIRECT_INVALID',400);ensure(/^[a-zA-Z0-9_-]{43,128}$/.test(state),'SHOPIFY_OAUTH_STATE_INVALID',400);
 const url=new URL('/admin/oauth/authorize','https://'+s.shopDomain);url.search=new URLSearchParams({client_id:s.auth.clientId,scope:'read_products',redirect_uri:redirect.href,state}).toString();return {authorizationUrl:url.href,state,shop:s.shopDomain,redirectUri:redirect.href,expiresAt:Date.now()+600000};
}
export function verifyOAuthCallback(query:URLSearchParams,attempt:{state:string;shop:string;expiresAt:number},secret:string,browserState:string,now=Date.now()){
 const keys=[...query.keys()];ensure(keys.every(k=>['code','shop','hmac','state','timestamp','host'].includes(k))&&new Set(keys).size===keys.length,'SHOPIFY_OAUTH_DUPLICATE_PARAMETER',403);const state=query.get('state')??'',signature=query.get('hmac')??'';const equal=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
 ensure(/^[a-zA-Z0-9_-]{43,128}$/.test(attempt.state)&&attempt.expiresAt>now&&equal(state,attempt.state)&&equal(state,browserState)&&query.get('shop')===attempt.shop&&/^\d+$/.test(query.get('timestamp')??'')&&Math.abs(now/1000-Number(query.get('timestamp')))<=300&&/^[a-f0-9]{64}$/.test(signature),'SHOPIFY_OAUTH_CALLBACK_INVALID',403);
 const message=[...query.entries()].filter(([k])=>k!=='hmac').sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('&');ensure(equal(createHmac('sha256',secret).update(message).digest('hex'),signature),'SHOPIFY_OAUTH_SIGNATURE_INVALID',403);ensure(/^[a-zA-Z0-9_-]{1,2048}$/.test(query.get('code')??''),'SHOPIFY_OAUTH_CODE_INVALID',403);return {shop:attempt.shop,code:query.get('code')!};
}
export async function exchangeOAuthCode(s:Data,code:string,transport:ShopifyTransport=shopifyTransport){return tokenResponse(await transport(new URL('/admin/oauth/access_token','https://'+shopDomain(s.shopDomain)),{client_id:s.auth.clientId,client_secret:s.auth.clientSecret,code,expiring:1},{}),Date.now(),true);}
export async function refreshOAuthToken(s:Data,refreshToken:string,transport:ShopifyTransport=shopifyTransport){return tokenResponse(await transport(new URL('/admin/oauth/access_token','https://'+shopDomain(s.shopDomain)),{grant_type:'refresh_token',client_id:s.auth.clientId,client_secret:s.auth.clientSecret,refresh_token:refreshToken},{}),Date.now(),true);}
