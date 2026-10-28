import type pg from 'pg';
import {z} from 'zod';
import {canonical,validateCapabilityValue} from '@steward/module-sdk';
import {INTELLIGENCE_STREAMS,intelligenceReferenceSchema,intelligenceEvidenceSetDigest,validateIntelligenceProjection,type IntelligenceProjection,type IntelligenceReference,type PricingEvidence,type PricingPublication} from '@steward/catalog-kit/intelligence';
import {fail,validUuid} from './security/crypto.js';

export interface IntelligenceView {reference:IntelligenceReference;projection:IntelligenceProjection;entityName:string;current:boolean;availabilityReason:string|null;observedAt:string;ingestedAt:string}
export const intelligencePageSchema=z.object({entityId:z.string().uuid().optional(),currency:z.enum(['USD','EUR','GBP','CAD','AUD','CHF']).optional(),purpose:z.enum(['business','simulation','all']).default('business'),status:z.enum(['current','all']).default('current'),from:z.string().datetime().optional(),to:z.string().datetime().optional(),q:z.string().max(160).optional(),limit:z.coerce.number().int().min(1).max(20).default(10),offset:z.coerce.number().int().min(0).max(10000).default(0)}).strict();
export type IntelligencePageInput=z.infer<typeof intelligencePageSchema>;
export function parseIntelligenceReferences(raw:unknown,maximum=8):IntelligenceReference[]{
 if(!Array.isArray(raw)||!raw.length||raw.length>maximum)fail(400,'Select bounded complete Worker source references');
 for(const r of raw)try{validateCapabilityValue(r,intelligenceReferenceSchema);}catch{fail(400,'Complete entity, Worker, module, stream, record and revision required');}
 if(new Set(raw.map(r=>canonical(r))).size!==raw.length)fail(400,'Duplicate intelligence source reference');return raw as IntelligenceReference[];
}
export function catalogIntelligenceAccess(pool:pg.Pool){
 async function scope(accountId:string){
  if(!validUuid(accountId))fail(403,'Analytical administrator required');
  const actor=(await pool.query('SELECT role FROM security_accounts WHERE account_id=$1 AND enabled',[accountId])).rows[0];
  if(!actor||!['registry_admin','enrollment_admin'].includes(actor.role))fail(403,'Analytical administrator required');
  const all=actor.role==='registry_admin',entities=(await pool.query('SELECT entity_id FROM entity_authorizations WHERE account_id=$1',[accountId])).rows.map(r=>r.entity_id as string);
  return{all,entities};
 }
 function allowed(s:{all:boolean;entities:string[]},id:string){if(!s.all&&!s.entities.includes(id))fail(404,'Intelligence source unavailable');}
 function view(row:any,reference:IntelligenceReference,projection:IntelligenceProjection,latestRevision:number):IntelligenceView{
  let current=latestRevision===reference.revision,reason:string|null=current?null:'Historical publication revision';
  if(projection.kind!=='pricing-evidence'){
   if(projection.status!=='published'){current=false;reason='Publication withdrawn';}
   else if(Date.parse(projection.validUntil)<=Date.now()){current=false;reason='Published evidence lease expired';}
   else if(Date.parse(projection.publishedAt)>Date.now()+5000){current=false;reason='Publication clock is in the future';}
  }
  return{reference,projection,entityName:row.entity_name??'Authorized entity',current,availabilityReason:reason,observedAt:new Date(row.source_at).toISOString(),ingestedAt:new Date(row.ingested_at).toISOString()};
 }
 async function resolve(accountId:string,raw:unknown,current=false){const references=parseIntelligenceReferences(raw),s=await scope(accountId),records:IntelligenceView[]=[];
  for(const ref of references){allowed(s,ref.entityId);const latest=(await pool.query('SELECT r.*,e.name AS entity_name FROM analytical_records r LEFT JOIN legal_entities e ON e.entity_id=r.entity_id WHERE r.entity_id=$1 AND r.installation_id=$2 AND r.module_id=$3 AND r.stream_id=$4 AND r.record_id=$5',[ref.entityId,ref.installationId,ref.moduleId,ref.streamId,ref.recordId])).rows[0];if(!latest)fail(404,'Intelligence source unavailable');let row=latest,projection:unknown=latest.payload?.projection;
   if(Number(latest.revision)!==ref.revision){const history=(await pool.query("SELECT envelope,ingested_at FROM sync_inbox WHERE envelope->>'eventType'='record.upsert' AND envelope->'source'->'entity'->>'entityId'=$1 AND envelope->'source'->>'installationId'=$2 AND envelope->>'moduleId'=$3 AND envelope->>'streamId'=$4 AND envelope->>'recordId'=$5 AND envelope->>'recordRevision'=$6 ORDER BY ingested_at LIMIT 2",[ref.entityId,ref.installationId,ref.moduleId,ref.streamId,ref.recordId,String(ref.revision)])).rows;const unique=new Set(history.map(h=>canonical(h.envelope.payload)));if(!history.length||unique.size!==1)fail(404,'Original unambiguous source envelope unavailable');projection=history[0].envelope.payload?.projection;row={...latest,source_at:history[0].envelope.occurredAt,ingested_at:history[0].ingested_at};}
   try{validateIntelligenceProjection(projection,{entityId:ref.entityId,installationId:ref.installationId,moduleId:ref.moduleId,streamId:ref.streamId});if(projection.id!==ref.recordId||projection.revision!==ref.revision)throw Error();}catch{fail(404,'Intelligence source unavailable');}
   const entry=view(row,ref,projection,Number(latest.revision));if(current&&!entry.current)fail(409,entry.availabilityReason??'Current publication required');records.push(entry);
  }return{references,records};
 }
 async function pricingEvidence(accountId:string,parent:IntelligenceView){
  const r=parent.reference;if(parent.projection.kind!=='pricing')fail(400,'Pricing publication required');await resolve(accountId,[r]);
  const rows=(await pool.query("SELECT * FROM analytical_records WHERE entity_id=$1 AND installation_id=$2 AND module_id=$3 AND stream_id='pricing_evidence_v1' AND payload->'projection'->>'publicationId'=$4 ORDER BY record_id LIMIT 65",[r.entityId,r.installationId,r.moduleId,r.recordId])).rows;
  const evidence:PricingEvidence[]=[];let invalid=false;
  for(const row of rows){try{const p=row.payload?.projection;validateIntelligenceProjection(p,{entityId:r.entityId,installationId:r.installationId,moduleId:r.moduleId,streamId:'pricing_evidence_v1'});if(p.kind!=='pricing-evidence'||p.publicationId!==r.recordId||p.id!==row.record_id||Number(row.revision)!==1)throw Error();evidence.push(p);}catch{invalid=true;}}
  const body=(parent.projection as PricingPublication).body,complete=!invalid&&evidence.length<=64&&evidence.length===body.evidenceCount&&intelligenceEvidenceSetDigest(evidence)===body.evidenceSetDigest&&evidence.every(e=>canonical(e.provider)===canonical(parent.projection.provider));
  return{evidence,complete,expectedCount:body.evidenceCount,reason:complete?null:'Original evidence set is missing, changed, oversized or inconsistent'};
 }
 async function query(accountId:string,raw:unknown,maximum?:number){const parsed=intelligencePageSchema.safeParse(raw);if(!parsed.success)fail(400,'Invalid bounded intelligence filters');const q=parsed.data,s=await scope(accountId);if(q.entityId)allowed(s,q.entityId);const now=new Date(),from=q.from??new Date(now.getTime()-30*86400000).toISOString(),to=q.to??now.toISOString();if(Date.parse(from)>=Date.parse(to)||new Date(from).toISOString()!==from.replace(/(?:\.(\d{1,3}))?Z$/,(_m,f)=>'.'+(f??'').padEnd(3,'0')+'Z')||new Date(to).toISOString()!==to.replace(/(?:\.(\d{1,3}))?Z$/,(_m,f)=>'.'+(f??'').padEnd(3,'0')+'Z'))fail(400,'Use a valid half-open UTC publication review window');
  const params:any[]=[INTELLIGENCE_STREAMS.filter(v=>v!=='pricing_evidence_v1'),s.all,s.entities],conditions=['stream_id=ANY($1::text[])','($2::boolean OR r.entity_id=ANY($3::uuid[]))'];const add=(sql:string,value:unknown)=>{params.push(value);conditions.push(sql.replaceAll('?',String(params.length)));};
  if(q.entityId)add('r.entity_id=$?::uuid',q.entityId);if(q.purpose!=='all')add("r.payload->'projection'->>'purpose'=$?",q.purpose);if(q.currency)add("(r.payload->'projection'->'body'->>'currency' IS NULL OR r.payload->'projection'->'body'->>'currency'=$?)",q.currency);
  add("(r.payload->'projection'->>'publishedAt')::timestamptz >= $?::timestamptz",from);add("(r.payload->'projection'->>'publishedAt')::timestamptz < $?::timestamptz",to);
  if(q.status==='current')conditions.push("r.payload->'projection'->>'status'='published' AND (r.payload->'projection'->>'validUntil')::timestamptz>now() AND (r.payload->'projection'->>'publishedAt')::timestamptz<=now()+interval '5 seconds'");
  if(q.q)add("(r.payload->'projection'->'body')::text ILIKE $? ESCAPE E'\\\\'",'%'+q.q.replace(/[\\%_]/g,c=>'\\'+c)+'%');
  params.push((maximum??q.limit)+1,maximum===undefined?q.offset:0);const rows=(await pool.query('SELECT r.*,e.name AS entity_name FROM analytical_records r LEFT JOIN legal_entities e ON e.entity_id=r.entity_id WHERE '+conditions.join(' AND ')+` ORDER BY r.source_at DESC,r.installation_id,r.module_id,r.stream_id,r.record_id LIMIT $${params.length-1} OFFSET $${params.length}`,params)).rows;
  const count=maximum??q.limit,records:IntelligenceView[]=[];for(const row of rows.slice(0,count)){try{const p=row.payload?.projection;validateIntelligenceProjection(p,{entityId:row.entity_id,installationId:row.installation_id,moduleId:row.module_id,streamId:row.stream_id});const ref={entityId:row.entity_id,installationId:row.installation_id,moduleId:row.module_id,streamId:row.stream_id,recordId:row.record_id,revision:Number(row.revision)} as IntelligenceReference;if(p.id!==ref.recordId||p.revision!==ref.revision)continue;records.push(view(row,ref,p,ref.revision));}catch{/* Invalid private payloads are never echoed. */}}
  return{records,nextOffset:rows.length>count?(maximum===undefined?q.offset:0)+count:null,filters:{...q,from,to},complete:rows.length<=count&&(maximum!==undefined||q.offset===0)&&records.length===rows.slice(0,count).length,maximum:count};
 }
 async function entities(accountId:string){const s=await scope(accountId);return(await pool.query('SELECT e.entity_id AS "entityId",e.name FROM legal_entities e WHERE ($1::boolean OR e.entity_id=ANY($2::uuid[])) AND EXISTS(SELECT 1 FROM enrolled_workers w WHERE w.entity_id=e.entity_id) ORDER BY e.name,e.entity_id',[s.all,s.entities])).rows;}
 return{scope,resolve,pricingEvidence,query,entities};
}
