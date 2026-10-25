import {createHmac,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {z} from 'zod';
import type {AnalyticalService,ScientificRequest,ScientificResult} from '@steward/contracts';

export const scientificConfigSchema=z.object({version:z.literal(1),endpoint:z.string().url(),keyFile:z.string().min(1),
 caFile:z.string().optional(),servername:z.string().optional(),allowIsolatedHttp:z.boolean().default(false),
 maximumExecutionMillis:z.number().int().min(500).max(12000).default(6000)}).strict();
export class ScientificError extends Error {
 constructor(public code:string,public status=503){super(code);}
}
export function scientificHeaders(key:Buffer,method:string,path:string,body:string,timestamp=Math.floor(Date.now()/1000),nonce=randomBytes(16).toString('hex')){
 return {'content-type':'application/json','x-steward-timestamp':String(timestamp),'x-steward-nonce':nonce,
 'x-steward-signature':createHmac('sha256',key).update(`${timestamp}\n${nonce}\n${method}\n${path}\n${body}`).digest('hex')};
}
export class ScientificClient implements AnalyticalService {
 constructor(private configFile=process.env.STEWARD_SCIENTIFIC_FILE){}
 private async configuration(){
  if(!this.configFile)throw new ScientificError('SCIENTIFIC_NOT_CONFIGURED');
  try{
   const c=scientificConfigSchema.parse(JSON.parse(await readFile(this.configFile,'utf8'))),url=new URL(c.endpoint);
   if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:'&&!(url.protocol==='http:'&&url.hostname==='scientific'&&c.allowIsolatedHttp))throw Error();
   const key=Buffer.from((await readFile(c.keyFile,'utf8')).trim());if(key.length<32)throw Error();
   return {c,url,key,ca:c.caFile?await readFile(c.caFile):undefined};
  }catch{throw new ScientificError('SCIENTIFIC_CONFIGURATION_INVALID');}
 }
 private async call(path:string,method:string,body:unknown,signal:AbortSignal,timeout:number){
  const{c,url,key,ca}=await this.configuration(),text=JSON.stringify(body);
  if(Buffer.byteLength(text)>262144)throw new ScientificError('SCIENTIFIC_INPUT_TOO_LARGE',413);
  return new Promise<any>((resolve,reject)=>{
   const request=(url.protocol==='https:'?httpsRequest:httpRequest)(new URL(path,url),{method,signal,timeout,
    headers:scientificHeaders(key,method,path,text),...(url.protocol==='https:'?{ca,servername:c.servername,rejectUnauthorized:true}: {})},response=>{
     let bytes=0;const chunks:Buffer[]=[];
     response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>1048576)request.destroy(new ScientificError('SCIENTIFIC_OUTPUT_TOO_LARGE'));else chunks.push(chunk);});
     response.on('end',()=>{try{const result=JSON.parse(Buffer.concat(chunks).toString());if(response.statusCode!==200){const code=/^SCIENTIFIC_[A-Z_]+$|^ANALYTICAL_INPUT_INVALID$|^CAPABILITY_UNAVAILABLE$/.test(result.error)?result.error:'SCIENTIFIC_FAILED';reject(new ScientificError(code,response.statusCode??503));}else resolve(result);}catch{reject(new ScientificError('SCIENTIFIC_OUTPUT_INVALID'));}});
    });
   request.on('timeout',()=>request.destroy(new ScientificError('SCIENTIFIC_TIMEOUT',504)));
   request.on('error',error=>reject(error instanceof ScientificError?error:new ScientificError(signal.aborted?'SCIENTIFIC_CANCELED':'SCIENTIFIC_UNAVAILABLE')));
   request.end(text);
  });
 }
 async analyze(raw:unknown,signal:AbortSignal):Promise<ScientificResult>{
  const input=raw as ScientificRequest,{c}=await this.configuration();
  if(!input||input.schemaVersion!==1||!Number.isInteger(input.executionMillis)||input.executionMillis<100||input.executionMillis>c.maximumExecutionMillis)throw new ScientificError('SCIENTIFIC_INPUT_INVALID',422);
  const result=await this.call('/v1/execute','POST',input,signal,input.executionMillis+2000);
  if(result.schemaVersion!==1||result.jobId!==input.jobId||result.capability!==input.capability||result.decisionExecuted!==false||JSON.stringify(result.entityIds)!==JSON.stringify(input.entityIds)||!result.calculation||!result.engine)throw new ScientificError('SCIENTIFIC_OUTPUT_INVALID');
  return result;
 }
 async cancel(jobId:string,signal:AbortSignal){
  if(!/^[a-f0-9-]{36}$/.test(jobId))throw new ScientificError('SCIENTIFIC_INPUT_INVALID',422);
  return this.call('/v1/jobs/'+jobId,'DELETE',{},signal,2000);
 }
}
