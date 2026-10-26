import {validateEconomicAllocation,validateEconomicScenarios} from './economic-validation.js';
import {createHmac,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {z} from 'zod';
import type {AnalyticalService,ScientificRequest,ScientificResult} from '@steward/contracts';
import {canonical} from './security/crypto.js';

const reference=z.object({entityId:z.string().uuid(),moduleId:z.string().max(80),streamId:z.string().max(50),recordId:z.string().uuid(),revision:z.number().int().positive()}).strict();
const resultSchema=z.object({schemaVersion:z.literal(1),jobId:z.string().uuid(),capability:z.enum(['describe-series','demand-forecast','procurement-optimization','scenario-comparison','mission-sustainability','economic-allocation','economic-scenarios']),inputDigest:z.string().regex(/^[a-f0-9]{64}$/),elapsedMillis:z.number().int().min(0).max(15000),entityIds:z.array(z.string().uuid()).min(1).max(8),decisionExecuted:z.literal(false),
 provenance:z.object({datasetId:z.string().uuid(),synthetic:z.boolean(),basis:z.enum(['authorized-synchronized-projection','synthetic-analytical-history']),asOf:z.string().datetime({offset:true}),references:z.array(reference).max(256),derivedFrom:z.array(z.object({schemaVersion:z.literal(1),jobId:z.string().uuid(),datasetId:z.string().uuid(),inputDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).max(4).optional()}).strict(),
 engine:z.object({service:z.literal('steward-scientific'),version:z.string().regex(/^\d+\.\d+\.\d+$/),contractVersion:z.literal(1),python:z.string(),numpy:z.string(),scipy:z.string(),pandas:z.string()}).strict(),
 calculation:z.record(z.string(),z.unknown())}).strict();
export function validateScientificResult(raw:unknown,input:ScientificRequest):ScientificResult{
 const parsed=resultSchema.safeParse(raw);if(!parsed.success)throw new ScientificError('SCIENTIFIC_OUTPUT_INVALID');const r=parsed.data;
 if(r.jobId!==input.jobId||r.capability!==input.capability||canonical(r.entityIds)!==canonical(input.entityIds)||canonical({...r.provenance,asOf:Date.parse(r.provenance.asOf)})!==canonical({...input.provenance,asOf:Date.parse(input.provenance.asOf)}))throw new ScientificError('SCIENTIFIC_OUTPUT_INVALID');
 const c=r.calculation as any;
 if(typeof c.status!=='string'||!['completed','partial','insufficient_data','optimal','infeasible','feasible_not_proven_optimal','no_feasible_solution'].includes(c.status))throw new ScientificError('SCIENTIFIC_OUTPUT_INVALID');
 const ids=input.entityIds;
 if(input.capability==='demand-forecast'&&(!Array.isArray(c.series)||c.series.some((s:any)=>!ids.includes(s.entityId)||!Array.isArray(s.forecast))))throw new ScientificError('SCIENTIFIC_OUTPUT_INVALID');
 if(input.capability==='procurement-optimization'&&(!Array.isArray(c.impacts)||c.impacts.some((i:any)=>!ids.includes(i.entityId))||!c.solver))throw new ScientificError('SCIENTIFIC_OUTPUT_INVALID');
 if(input.capability==='scenario-comparison'&&(!Array.isArray(c.scenarios)||c.scenarios.some((s:any)=>!Array.isArray(s.entityImplications)||s.entityImplications.some((i:any)=>!ids.includes(i.entityId)))))throw new ScientificError('SCIENTIFIC_OUTPUT_INVALID');
 if(input.capability==='economic-allocation'||input.capability==='economic-scenarios'){try{const problem=input.capability==='economic-allocation'?input.parameters:(input.parameters as any).baseline;const required=[...problem.sources.map((s:any)=>s.entityId),...problem.programs.map((p:any)=>p.entityId),...problem.resources.map((r:any)=>r.ownerEntityId)];if(!input.provenance.synthetic||required.some(id=>!input.entityIds.includes(id)))throw Error();if(input.capability==='economic-allocation')validateEconomicAllocation(input.parameters,c);else validateEconomicScenarios(input.parameters,c);}catch{throw new ScientificError('SCIENTIFIC_OUTPUT_INVALID');}}
 const{derivedFrom,...provenance}=r.provenance;
 return{...r,provenance:{...provenance,...(derivedFrom?{derivedFrom}:{})}};
}

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
  return validateScientificResult(result,input);
 }
 async cancel(jobId:string,signal:AbortSignal){
  if(!/^[a-f0-9-]{36}$/.test(jobId))throw new ScientificError('SCIENTIFIC_INPUT_INVALID',422);
  return this.call('/v1/jobs/'+jobId,'DELETE',{},signal,2000);
 }
}
