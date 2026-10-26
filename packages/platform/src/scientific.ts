import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import type pg from 'pg';
import type {ScientificRequest,ScientificResult,ScientificEvidenceReference} from '@steward/contracts';
import type {SecureApp,Authentication} from './security/auth.js';
import {audit,transaction} from './security/store.js';
import {canonical,fail,validUuid} from './security/crypto.js';
import {ScientificClient,ScientificError} from './scientific-client.js';
import {assertScientificScope,scienceRunSchema,forecastOptions,forecastProcurement,procurementSchema,scenarioOptions} from './scientific-schema.js';
import {analyticalCapabilityCatalog} from './analytical-capabilities.js';
import {canonicalBusinessPayload,sourceReference} from './business-analysis.js';

export const scientificMigration=`
CREATE TABLE scientific_datasets (
 dataset_id uuid PRIMARY KEY, content_digest text NOT NULL UNIQUE,
 label text NOT NULL, basis text NOT NULL CHECK(basis IN ('synthetic-analytical-history','authorized-synchronized-projection')),
 synthetic boolean NOT NULL, entity_ids uuid[] NOT NULL,
 content jsonb NOT NULL, provenance jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES security_accounts(account_id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE scientific_runs (
 job_id uuid PRIMARY KEY, dataset_id uuid NOT NULL REFERENCES scientific_datasets(dataset_id),
 request_digest text NOT NULL, entity_ids uuid[] NOT NULL, capability text NOT NULL,
 request jsonb NOT NULL, result jsonb, error_code text,
 state text NOT NULL CHECK(state IN ('running','completed','failed','canceled','interrupted')),
 created_by uuid NOT NULL REFERENCES security_accounts(account_id),
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE TABLE scientific_finding_evidence (
 finding_id uuid PRIMARY KEY REFERENCES analytical_findings(finding_id),
 job_id uuid NOT NULL UNIQUE REFERENCES scientific_runs(job_id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scientific_runs_recent ON scientific_runs(created_at DESC);
`;
const digest=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
const datasetSchema=z.object({entityIds:z.array(z.string().uuid()).min(1).max(8),basis:z.enum(['synthetic-analytical-history','authorized-synchronized-projection']),measure:z.enum(['orders','units']).default('units'),interval:z.enum(['hour','day','week']).default('day'),product:z.string().min(1).max(120).optional()}).strict();

/** Actual disclosed order observations only. Absent intervals remain missing. */
export function operationalScienceDataset(records:any[],entityIds:string[],measure:'orders'|'units',interval:'hour'|'day'|'week',product?:string){
 const seconds={hour:3600,day:86400,week:604800}[interval],references:any[]=[];
 const series=entityIds.map(entityId=>{
  const buckets=new Map<number,number>();
  for(const r of records.filter(r=>r.entity_id===entityId&&r.stream_id==='commerce_orders')){
   const p=canonicalBusinessPayload(r);if(p?.approved!==true||p.status==='canceled'||!Number.isFinite(Date.parse(p.orderCreatedAt)))continue;
   const lines=Array.isArray(p.products)?p.products.filter((l:any)=>!product||l.sku===product||l.sourceVariantId===product):[];
   if(product&&!lines.length)continue;
   const value=measure==='orders'?1:lines.reduce((n:number,l:any)=>n+(Number.isSafeInteger(l.quantity)&&l.quantity>0?l.quantity:0),0);
   if(value>1e9)fail(413,'Observation exceeds scientific count limits');
   const at=Math.floor(Date.parse(p.orderCreatedAt)/(seconds*1000))*seconds*1000;
   buckets.set(at,(buckets.get(at)??0)+value);references.push(sourceReference(r));
  }
  const observations=[...buckets].sort((a,b)=>a[0]-b[0]).map(([at,value])=>({at:new Date(at).toISOString(),value}));
  if(observations.length>2048)fail(413,'Narrow the analytical history interval or product');
  return{entityId,key:product??measure,measure,observations};
 });
 if(references.length>256)fail(413,'Narrow the scientific evidence cohort (maximum 256 source references)');
 return{interval,coverage:'unknown',series,references,limitations:['Authorized disclosed source observations only; absent intervals are missing, not zero.','Operational history is not supplemented with synthetic past transactions.']};
}

export async function scientificRoutes(app:SecureApp,pool:pg.Pool,auth:Authentication,origin:string,client=new ScientificClient()){
 const running=new Map<string,AbortController>();let reserved=0;
 await pool.query("UPDATE scientific_runs SET state='interrupted',error_code='SCIENTIFIC_RESTART_INTERRUPTED',finished_at=now() WHERE state='running'");
 app.addHook('onClose',async()=>{for(const controller of running.values())controller.abort();});
 async function scope(req:any,mutate=false){
  const actor=await auth.session(req,mutate);
  if(!['registry_admin','enrollment_admin'].includes(actor.role))fail(403,'Authorized analytical administrator required');
  const response=await app.inject({method:'GET',url:'/api/v4/analytics',headers:{cookie:req.headers.cookie}});
  if(response.statusCode!==200)fail(response.statusCode,'Analytical scope unavailable');
  const data=response.json();return{actor,data,allowed:data.entities.map((e:any)=>e.entity_id) as string[]};
 }
 async function dataset(id:string,allowed:string[]){
  if(!validUuid(id))fail(400,'Invalid dataset');
  const row=(await pool.query('SELECT * FROM scientific_datasets WHERE dataset_id=$1 AND entity_ids <@ $2::uuid[]',[id,allowed])).rows[0];
  if(!row)fail(404,'Scientific dataset unavailable in this account scope');return row;
 }
 async function run(id:string,allowed:string[]){
  if(!validUuid(id))fail(400,'Invalid scientific run');
  const row=(await pool.query('SELECT * FROM scientific_runs WHERE job_id=$1 AND entity_ids <@ $2::uuid[]',[id,allowed])).rows[0];
  if(!row)fail(404,'Scientific result unavailable in this account scope');return row;
 }
 app.get('/api/v4/scientific',async req=>{
  const s=await scope(req);
  return{capabilities:Object.values(analyticalCapabilityCatalog).filter(c=>c.engine==='python'),
   datasets:(await pool.query('SELECT dataset_id,label,basis,synthetic,entity_ids,created_at FROM scientific_datasets WHERE entity_ids <@ $1::uuid[] ORDER BY created_at DESC LIMIT 100',[s.allowed])).rows,
   runs:(await pool.query(`SELECT r.job_id,r.dataset_id,r.entity_ids,r.capability,r.state,r.error_code,r.created_at,r.finished_at,e.finding_id,
    CASE WHEN r.state='completed' THEN jsonb_build_object('synthetic',r.result#>'{provenance,synthetic}',
     'status',r.result#>'{calculation,status}','currency',r.result#>'{calculation,currency}',
     'baselineExternalCents',coalesce(r.result#>'{calculation,baselineExternalCents}',r.result#>'{calculation,coordinatedBaseline,baselineExternalCents}'),
     'proposedCostCents',coalesce(r.result#>'{calculation,proposedCostCents}',r.result#>'{calculation,coordinatedBaseline,proposedCostCents}'),
     'ecosystemBenefitCents',coalesce(r.result#>'{calculation,ecosystemBenefitCents}',r.result#>'{calculation,coordinatedBaseline,ecosystemBenefitCents}'),
     'method',r.result#>'{calculation,method}') ELSE NULL END AS summary
    FROM scientific_runs r LEFT JOIN scientific_finding_evidence e USING(job_id)
    WHERE r.entity_ids <@ $1::uuid[] ORDER BY r.created_at DESC LIMIT 100`,[s.allowed])).rows,
   canPublish:s.actor.role==='registry_admin',decisionExecuted:false};
 });
 app.get<{Params:{id:string}}>('/api/v4/scientific/datasets/:id',async req=>{const s=await scope(req);return{dataset:await dataset(req.params.id,s.allowed)};});
 app.post('/api/v4/scientific/datasets',async req=>{
  const s=await scope(req,true),parsed=datasetSchema.safeParse(req.body);if(!parsed.success)fail(400,'Invalid scientific dataset request');const b=parsed.data;
  const ids=b.entityIds.slice().sort();assertScientificScope(s.allowed,ids);
  let content:any,synthetic:boolean;
  if(b.basis==='synthetic-analytical-history'){
   if(ids.length!==2||b.product||b.interval!=='day'||b.measure!=='units')fail(400,'The labeled synthetic reference history requires two entities, daily units and its declared product');
   const fixture=JSON.parse(await readFile(new URL('../../../datasets/scientific-history-v1.json',import.meta.url),'utf8'));
   content={...fixture,series:fixture.series.map((row:any,i:number)=>{const{entityKey,...rest}=row;return{...rest,entityId:ids[i]};}),interval:'day',coverage:'declared-complete'};synthetic=true;
  }else{
   content=operationalScienceDataset(s.data.records,ids,b.measure,b.interval,b.product);
   synthetic=s.data.records.some((r:any)=>ids.includes(r.entity_id)&&r.stream_id==='commerce_orders'&&canonicalBusinessPayload(r)?.simulation);
   content.label='Disclosed operational observations'+(synthetic?' (includes synthetic commerce)':'');
  }
  const hash=digest({basis:b.basis,entityIds:ids,content}),id=randomUUID();
  const provenance={datasetId:id,synthetic,basis:b.basis,asOf:new Date().toISOString(),references:content.references??[]};
  return transaction(pool,async sql=>{
   const row=(await sql.query(`INSERT INTO scientific_datasets(dataset_id,content_digest,label,basis,synthetic,entity_ids,content,provenance,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(content_digest) DO NOTHING RETURNING *`,[id,hash,content.label,b.basis,synthetic,ids,content,provenance,s.actor.account_id])).rows[0]
    ??(await sql.query('SELECT * FROM scientific_datasets WHERE content_digest=$1',[hash])).rows[0];
   await audit(sql,s.actor.account_id,'scientific.dataset',row.dataset_id,{basis:b.basis,entityIds:ids});return{dataset:row};
  });
 });
 async function buildRequest(b:z.infer<typeof scienceRunSchema>,d:any,s:any):Promise<ScientificRequest>{
  let parameters:any;const derivedFrom:ScientificEvidenceReference[]=[];
  if(b.capability==='demand-forecast')parameters={...forecastOptions.parse(b.options),interval:d.content.interval,coverage:d.content.coverage,series:d.content.series};
  else{
   const option=z.object({forecastRunId:z.string().uuid().optional(),problem:procurementSchema.optional(),scenarios:scenarioOptions.shape.scenarios.optional(),sensitivity:scenarioOptions.shape.sensitivity}).strict().parse(b.options);
   let problem:any;
   if(option.problem){problem=option.problem;assertScientificScope(d.entity_ids,problem.entities.map((e:any)=>e.entityId));if(problem.entities.length!==d.entity_ids.length)fail(422,'Every dataset entity must participate');}
   else{
    if(!option.forecastRunId)fail(422,'Select a completed forecast or declare approved purchasing inputs');
    const f=await run(option.forecastRunId,s.allowed);
    if(f.dataset_id!==d.dataset_id||f.capability!=='demand-forecast'||f.state!=='completed')fail(422,'Select a completed forecast for this exact dataset');
    derivedFrom.push({schemaVersion:1,jobId:f.job_id,datasetId:f.dataset_id,inputDigest:f.result.inputDigest});
    problem=forecastProcurement(d,f.result.calculation);
   }
   if(b.capability==='scenario-comparison'){
    const selected=scenarioOptions.parse({scenarios:option.scenarios,sensitivity:option.sensitivity});parameters={baseline:problem,...selected};
   }else{if(option.scenarios||option.sensitivity)fail(400,'Scenario parameters require scenario-comparison');parameters=problem;}
  }
  return{schemaVersion:1,jobId:b.jobId,principalId:s.actor.account_id,entityIds:d.entity_ids,provenance:{...d.provenance,...(derivedFrom.length?{derivedFrom}:{})},
   capability:b.capability,parameters,executionMillis:b.capability==='scenario-comparison'?12000:6000};
 }
 app.post('/api/v4/scientific/runs',async(req,reply)=>{
  const s=await scope(req,true),parsed=scienceRunSchema.safeParse(req.body);if(!parsed.success)fail(400,'Invalid bounded scientific run request');const b=parsed.data;
  const d=await dataset(b.datasetId,s.allowed),fingerprint=digest(b);
  const previous=(await pool.query('SELECT * FROM scientific_runs WHERE job_id=$1',[b.jobId])).rows[0];
  if(previous){assertScientificScope(s.allowed,previous.entity_ids);if(previous.request_digest!==fingerprint)fail(409,'Scientific request identity belongs to different inputs');return reply.code(previous.state==='running'?202:200).send({run:previous});}
  if(reserved>=2)fail(429,'Scientific capacity reached; wait for a running calculation');reserved++;
  let launched=false;
  try{
   await auth.rateLimit('scientific:'+s.actor.account_id,20);
   let input:ScientificRequest;try{input=await buildRequest(b,d,s);}catch(e){if(e instanceof z.ZodError)fail(422,'Invalid scientific parameters or unsupported constraints');throw e;}
   const inserted=await transaction(pool,async sql=>{
    const row=(await sql.query(`INSERT INTO scientific_runs(job_id,dataset_id,request_digest,entity_ids,capability,request,state,created_by) VALUES($1,$2,$3,$4,$5,$6,'running',$7) ON CONFLICT(job_id) DO NOTHING RETURNING *`,[b.jobId,d.dataset_id,fingerprint,d.entity_ids,b.capability,input,s.actor.account_id])).rows[0];
    if(row)await audit(sql,s.actor.account_id,'scientific.started',b.jobId,{capability:b.capability,entityIds:d.entity_ids});return row;
   });
   if(!inserted){const existing=await run(b.jobId,s.allowed);if(existing.request_digest!==fingerprint)fail(409,'Scientific request identity belongs to different inputs');return reply.code(existing.state==='running'?202:200).send({run:existing});}
   const controller=new AbortController();running.set(b.jobId,controller);launched=true;
   void (async()=>{
    try{
     const result=await client.analyze(input,controller.signal);
     await pool.query("UPDATE scientific_runs SET state='completed',result=$2,finished_at=now() WHERE job_id=$1 AND state='running'",[b.jobId,result]);
     await audit(pool,s.actor.account_id,'scientific.completed',b.jobId,{capability:b.capability,elapsedMillis:result.elapsedMillis});
    }catch(error){
     const code=error instanceof ScientificError?error.code:'SCIENTIFIC_FAILED';
     await pool.query("UPDATE scientific_runs SET state=$2,error_code=$3,finished_at=now() WHERE job_id=$1 AND state='running'",[b.jobId,controller.signal.aborted?'canceled':'failed',code]);
     await audit(pool,s.actor.account_id,'scientific.failed',b.jobId,{code});
    }finally{running.delete(b.jobId);reserved--;}
   })().catch(()=>{});
   return reply.code(202).send({run:inserted});
  }finally{if(!launched)reserved--;}
 });
 app.get<{Params:{id:string}}>('/api/v4/scientific/runs/:id',async req=>{const s=await scope(req);return{run:await run(req.params.id,s.allowed)};});
 app.post<{Params:{id:string}}>('/api/v4/scientific/runs/:id/cancel',async req=>{
  const s=await scope(req,true),r=await run(req.params.id,s.allowed);if(r.state!=='running')return{state:r.state};
  running.get(r.job_id)?.abort();await pool.query("UPDATE scientific_runs SET state='canceled',error_code='SCIENTIFIC_CANCELED',finished_at=now() WHERE job_id=$1 AND state='running'",[r.job_id]);
  await audit(pool,s.actor.account_id,'scientific.canceled',r.job_id);return{state:'canceled'};
 });
 app.get<{Params:{id:string}}>('/api/v4/scientific/findings/:id',async req=>{const s=await scope(req);if(!validUuid(req.params.id))fail(400,'Invalid finding');const link=(await pool.query('SELECT job_id FROM scientific_finding_evidence WHERE finding_id=$1',[req.params.id])).rows[0];if(!link)fail(404,'Scientific evidence unavailable');return{run:await run(link.job_id,s.allowed)};});
 app.post<{Params:{id:string}}>('/api/v4/scientific/runs/:id/finding',async req=>{
  const s=await scope(req,true);if(s.actor.role!=='registry_admin')fail(403,'Registry administrator review required');const r=await run(req.params.id,s.allowed);
  if(r.state!=='completed'||!r.result?.calculation)fail(422,'A completed scientific result is required');
  const review=z.object({reviewed:z.literal(true)}).strict().safeParse(req.body);if(!review.success)fail(400,'Explicit human review is required');
  const calc=r.result.calculation;if(!['optimal','completed'].includes(calc.status))fail(422,'Infeasible or partial calculations cannot become recommendations');
  return transaction(pool,async sql=>{
   await sql.query('SELECT job_id FROM scientific_runs WHERE job_id=$1 FOR UPDATE',[r.job_id]);
   const existing=(await sql.query('SELECT finding_id FROM scientific_finding_evidence WHERE job_id=$1',[r.job_id])).rows[0];if(existing)return{findingId:existing.finding_id};
   const id=randomUUID(),synthetic=r.result.provenance.synthetic;
   // Cross-entity private cost details stay in the all-participant-scoped run.
   // Workers receive a shared explanation without other companies' figures.
   const explanation=`${synthetic?'SYNTHETIC ANALYTICAL SCENARIO — not a real commercial forecast. ':''}Scientific ${r.capability.replaceAll('-',' ')} reviewed by a Master administrator. Estimated outcomes remain conditional, not realized benefits or approved actions. Review original calculation ${r.job_id} in Master Steward with all-participant authorization. Separate entity consent, supplier terms and financial assumptions require human decisions. No purchase, transfer, reservation or production has been authorized.`;
   await sql.query("INSERT INTO analytical_findings(finding_id,severity,explanation,status,supporting_references) VALUES($1,'info',$2,'open',$3)",[id,explanation,JSON.stringify(r.result.provenance.references.slice(0,20))]);
   for(const entity of r.entity_ids)await sql.query('INSERT INTO finding_entities VALUES($1,$2)',[id,entity]);
   await sql.query('INSERT INTO scientific_finding_evidence(finding_id,job_id) VALUES($1,$2)',[id,r.job_id]);
   // Existing synchronization timer materializes and delivers this finding.
   await audit(sql,s.actor.account_id,'scientific.finding.reviewed',id,{jobId:r.job_id,entityIds:r.entity_ids});return{findingId:id};
  });
 });
}
