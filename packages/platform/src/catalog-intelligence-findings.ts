import {randomUUID} from 'node:crypto';

import {z} from 'zod';

import type pg from 'pg';

import {canonical,digest,operationFor,verifyPackage,type PublisherTrust} from '@steward/module-sdk';

import {isIntelligenceStream,type PricingPublication,type IntelligenceReference} from '@steward/catalog-kit/intelligence';

import type {SecureApp,Authentication,Account} from './security/auth.js';

import {fail,validUuid} from './security/crypto.js';

import {transaction,audit,type Sql} from './security/store.js';

import {catalogIntelligenceAccess,parseIntelligenceReferences} from './catalog-intelligence-access.js';

import {comparePublishedContributions,recomputePublishedContribution,contributionCohortKey,validatePublishedStatistics,publishedScientificRequestDigest,scientificPublicationReferences} from './catalog-intelligence-calculation.js';

import {validateScientificResult} from './scientific-client.js';



/** Original immutable calculation + current exact source authority, not model assertions. */

export async function verifyCatalogCalculation(pool:Sql,accountId:string,row:any,owner=false){

 if(!row||owner&&row.account_id!==accountId)fail(404,'Catalog calculation unavailable');

 const access=catalogIntelligenceAccess(pool as pg.Pool),resolved=await access.resolve(accountId,row.source_references,true),rows=[];

 for(const view of resolved.records){if(view.projection.kind!=='pricing')fail(422,'Only reviewed contribution calculations can become financial recommendations');const set=await access.pricingEvidence(accountId,view);if(!set.complete)fail(409,'Complete original contribution evidence is required');const publication=view.projection as PricingPublication,calculation=recomputePublishedContribution(publication,set.evidence);if(publication.originCoverage!=='complete'||calculation.baseline.status!=='complete')fail(422,'Incomplete or unknown-origin contributions cannot become recommendations');rows.push({publication,calculation,evidence:set.evidence});}

 if(rows.length<2)fail(422,'At least two reviewed contribution observations are required');
 if(new Set(rows.map(r=>r.publication.purpose)).size!==1)fail(422,'Business and simulation publications cannot share one financial finding');

 if(canonical(row.input?.references)!==canonical(row.source_references))fail(409,'Retained calculation references differ');

 const comparison=comparePublishedContributions(rows);

 if(row.input.kind==='contribution-comparison-v1'){

  if(canonical(row.result?.sourceReferences)!==canonical(row.source_references)||canonical(row.result?.comparison)!==canonical(comparison)||row.result?.decisionExecuted!==false||!comparison.groups.some(g=>g.comparable&&g.ranked.length>=2))fail(422,'A meaningful complete compatible comparison is required');

 }else if(row.input.kind==='pricing-descriptive-statistics-v1'){

  const input=row.input.scientificRequest,result=row.result,values=rows.map(r=>result.measure==='contribution'?r.calculation.baseline.contributionCents:r.calculation.baseline.totalVariableCostCents);

  if(!['contribution','variable-cost'].includes(result.measure)||new Set(rows.map(r=>contributionCohortKey(r.publication))).size!==1||input?.jobId!==row.calculation_id||input?.principalId!==row.account_id||input?.capability!=='describe-series'||canonical(input?.parameters)!==canonical({values})||canonical(input?.provenance?.references)!==canonical(scientificPublicationReferences(row.source_references))||canonical(result.sourceReferences)!==canonical(row.source_references)||result.decisionExecuted!==false)fail(409,'Original scientific source bindings differ');

  try{validateScientificResult(result.scientific,input);if(result.scientific.inputDigest!==publishedScientificRequestDigest(input)||result.scientific.calculation.status!=='completed')throw Error();const exact=validatePublishedStatistics(values,result.scientific);if(canonical(exact)!==canonical(result.exactObservedMeanFraction))throw Error();}catch{fail(409,'Original scientific calculation cannot be verified');}

 }else fail(422,'This calculation does not support a financial recommendation');

 const names=(await pool.query('SELECT entity_id,name FROM legal_entities WHERE entity_id=ANY($1::uuid[])',[[...new Set(resolved.references.map(r=>r.entityId))]])).rows;return{row,references:resolved.references,rows,comparison,entityNames:Object.fromEntries(names.map(r=>[r.entity_id,r.name]))};

}

export async function authorizeCatalogFinding(pool:Sql,accountId:string,findingId:string){const row=(await pool.query('SELECT c.* FROM catalog_finding_evidence e JOIN catalog_calculations c USING(calculation_id) WHERE e.finding_id=$1',[findingId])).rows[0];if(!row)return null;return verifyCatalogCalculation(pool,accountId,row);}

const money=(currency:string,n:number)=>{const a=BigInt(n),sign=a<0n?'-':'',v=a<0n?-a:a;return currency+' '+sign+v/100n+'.'+String(v%100n).padStart(2,'0');};

/** Classification is derived from original reviewed source rows, never a client flag. */
export function catalogFindingSynthetic(value:Awaited<ReturnType<typeof verifyCatalogCalculation>>,worker?:string,entity?:string){const own=value.rows.filter(r=>!worker||r.publication.installationId===worker&&r.publication.entityId===entity);if(!own.length)fail(409,'Finding has no original source from this Worker');return own.some(r=>r.publication.purpose==='simulation'||r.publication.containsSimulator);}

export function catalogFindingText(value:Awaited<ReturnType<typeof verifyCatalogCalculation>>,worker?:string,entity?:string){const own=value.rows.filter(r=>!worker||r.publication.installationId===worker&&r.publication.entityId===entity);if(!own.length)fail(409,'Finding has no original source from this Worker');return ((catalogFindingSynthetic(value,worker,entity)?'SYNTHETIC SIMULATION: ':'')+'Reviewed conditional contribution observations; these are estimates, not realized profit. '+own.map(r=>r.publication.body.name+' ('+(value.entityNames[r.publication.entityId]??'Authorized company')+'): '+money(r.publication.body.currency,r.calculation.baseline.contributionCents!)+' prospective contribution for '+r.publication.body.quantity+' '+r.publication.body.unitDefinition.unitOfMeasure).join('; ')+'. '+(worker?'Only original observations from this installation are shown; details about other entities and ecosystem comparisons remain restricted to the authorized Master. ':'Compatibility is an explicitly declared comparison scope, not product or supplier identity. ')+'Review current prices, costs, quantities, specifications, allocation and separate entity approvals. No price, purchase, reservation, transfer or production decision was executed.').slice(0,4000);}

export function catalogFindingScopes(value:Awaited<ReturnType<typeof verifyCatalogCalculation>>,worker:string,entity:string){const scopes=new Map<string,{provider:PricingPublication['provider'];streams:string[]}>();for(const r of value.rows){const p=r.publication;if(p.installationId!==worker)continue;if(p.entityId!==entity)fail(409,'Finding source Worker/entity mismatch');const key=canonical(p.provider),old=scopes.get(key)??{provider:p.provider,streams:[]};if(!old.streams.includes('pricing_publications_v1'))old.streams.push('pricing_publications_v1');scopes.set(key,old);}if(!scopes.size)fail(409,'Finding has no original source module for this Worker');return[...scopes.values()];}



export function catalogIntelligenceFindingRoutes(app:SecureApp,pool:pg.Pool,auth:Authentication){

 app.post<{Params:{id:string}}>('/api/v15/catalog-intelligence/calculations/:id/finding',async req=>{const actor=await auth.session(req,true);if(actor.role!=='registry_admin')fail(403,'Registry administrator human review required');if(!validUuid(req.params.id)||!z.object({reviewed:z.literal(true)}).strict().safeParse(req.body).success)fail(400,'Explicit reviewed calculation required');return transaction(pool,async sql=>{const reviewer=(await sql.query('SELECT role FROM security_accounts WHERE account_id=$1 AND enabled FOR SHARE',[actor.account_id])).rows[0];if(reviewer?.role!=='registry_admin')fail(403,'Current registry administrator review required');await sql.query('SELECT pg_advisory_xact_lock(hashtext($1))',['catalog-finding:'+req.params.id]);const row=(await sql.query('SELECT * FROM catalog_calculations WHERE calculation_id=$1',[req.params.id])).rows[0];if(!row||row.account_id!==actor.account_id)fail(404,'Owned Catalog calculation unavailable');const refs=parseIntelligenceReferences(row.source_references);for(const r of refs)await sql.query('SELECT 1 FROM analytical_records WHERE entity_id=$1 AND installation_id=$2 AND module_id=$3 AND stream_id=$4 AND record_id=$5 FOR SHARE',[r.entityId,r.installationId,r.moduleId,r.streamId,r.recordId]);const verified=await verifyCatalogCalculation(sql,actor.account_id,row,true),old=(await sql.query('SELECT finding_id FROM catalog_finding_evidence WHERE calculation_id=$1',[row.calculation_id])).rows[0];if(old)return{findingId:old.finding_id,idempotent:true,pendingDurableDelivery:true};const id=randomUUID();await sql.query("INSERT INTO analytical_findings(finding_id,severity,explanation,status,supporting_references) VALUES($1,'info',$2,'open',$3)",[id,catalogFindingText(verified),JSON.stringify(refs)]);for(const entity of new Set(refs.map(r=>r.entityId)))await sql.query('INSERT INTO finding_entities VALUES($1,$2)',[id,entity]);await sql.query('INSERT INTO catalog_finding_evidence VALUES($1,$2)',[id,row.calculation_id]);await audit(sql,actor.account_id,'catalog.finding.reviewed',id,{calculationId:row.calculation_id});return{findingId:id,pendingDurableDelivery:true};});});

 app.get<{Params:{id:string}}>('/api/v15/catalog-intelligence/findings/:id/evidence',async req=>{const actor=await auth.session(req);if(!validUuid(req.params.id))fail(400,'Invalid finding identity');const value=await authorizeCatalogFinding(pool,actor.account_id,req.params.id);if(!value)fail(404,'Catalog finding unavailable');return{findingId:req.params.id,synthetic:catalogFindingSynthetic(value),calculationId:value.row.calculation_id,sourceReferences:value.references,calculation:value.row.result,decisionExecuted:false,requiresHumanReview:true};});

}



/** Local account grants are checked against the CURRENT verified original module. */

export async function authorizeLocalCatalogFinding(pool:Sql,actor:Account,row:any,installationId:string,trust:PublisherTrust){

 if(!row?.payload)fail(404,'Finding unavailable');const payload=row.payload;

 if(!payload.catalogScopes){if(payload.supportingReferences?.some((r:any)=>isIntelligenceStream(r?.streamId)))fail(404,'Scoped Catalog finding unavailable');return;}

 if(typeof payload.synthetic!=='boolean'||typeof payload.explanation!=='string'||payload.explanation.startsWith('SYNTHETIC SIMULATION:')!==payload.synthetic)fail(404,'Explicit Catalog finding classification unavailable');
 if(!['local_admin','module_user'].includes(actor.role)||(await pool.query('SELECT 1 FROM security_accounts WHERE account_id=$1 AND enabled AND role=$2',[actor.account_id,actor.role])).rowCount!==1)fail(404,'Catalog finding unavailable');

 const enrollment=(await pool.query("SELECT entity_id FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0];if(!enrollment||!Array.isArray(payload.affectedEntities)||payload.affectedEntities.length!==1||payload.affectedEntities[0]!==enrollment.entity_id)fail(404,'Catalog finding unavailable');const refs=parseIntelligenceReferences(payload.supportingReferences),scopes=payload.catalogScopes;if(!Array.isArray(scopes)||!scopes.length||scopes.length>8||!refs.length||refs.some(r=>r.installationId!==installationId||r.entityId!==enrollment.entity_id))fail(404,'Catalog finding unavailable');const seen=new Set<string>();

 for(const s of scopes){if(!s||Object.keys(s).sort().join(',')!=='provider,streams'||!s.provider||Object.keys(s.provider).sort().join(',')!=='entityId,moduleId,moduleInstallationId,packageDigest,workerInstallationId'||s.provider.workerInstallationId!==installationId||s.provider.entityId!==enrollment.entity_id||!Array.isArray(s.streams)||!s.streams.length||new Set(s.streams).size!==s.streams.length||!s.streams.every((v:unknown)=>typeof v==='string'&&isIntelligenceStream(v))||seen.has(s.provider.moduleId))fail(404,'Catalog finding unavailable');seen.add(s.provider.moduleId);const r=(await pool.query("SELECT * FROM module_installations WHERE module_id=$1 AND state='active'",[s.provider.moduleId])).rows[0];if(!r||r.operation_id!==s.provider.moduleInstallationId||digest(canonical(r.descriptor))!==s.provider.packageDigest)fail(404,'Original Catalog finding module unavailable');let manifest;try{manifest=verifyPackage(r.descriptor,trust).manifest;}catch{fail(404,'Verified Catalog finding module unavailable');}const op=operationFor(manifest!,'GET','/analytical-overview');if(manifest!.moduleId!==r.module_id||manifest!.version!==r.version||!op||!op.permission.endsWith('.read')||!s.streams.every((stream:string)=>manifest!.replication?.streams.some(v=>v.streamId===stream))||!refs.filter(ref=>ref.moduleId===r.module_id).every(ref=>s.streams.includes(ref.streamId)))fail(404,'Declared Catalog finding read authority unavailable');if(actor.role==='module_user'&&!(await pool.query('SELECT 1 FROM module_permissions WHERE account_id=$1 AND module_id=$2 AND permission=$3',[actor.account_id,r.module_id,op.permission])).rowCount)fail(404,'Catalog finding read permission unavailable');}

 if(refs.some(r=>!seen.has(r.moduleId)))fail(404,'Incomplete local Catalog finding scope');

}
