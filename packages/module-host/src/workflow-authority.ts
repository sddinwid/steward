import type pg from 'pg';
import {canonical,digest,verifyPackage,validateWorkflowGraph,type PublisherTrust,type WorkflowGraph,type WorkflowFields,type WorkflowPublicationReference} from '@steward/module-sdk';

/** An execution projection retains these exact identities. A later approval,
 * package or installation is not silently substituted into existing work. */
export type WorkflowPublicationPin = WorkflowPublicationReference;
type Call=(id:string,method:string,path:string,body?:unknown,headers?:Record<string,string>,timeout?:number)=>Promise<{status:number;value:any}>;
export interface VerifiedWorkflowPublication {
  contractVersion:1;workflowId:string;version:number;name:string;description:string;
  graph:WorkflowGraph;fields:WorkflowFields;trigger:{kind:'manual';input:Record<string,unknown>};consumerId:string;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash=/^[0-9a-f]{64}$/;
function requireAuthority(value:unknown,code:string):asserts value{if(!value)throw Error(code);}

/** Read the authoritative module through its declared authenticated API. This is
 * a precondition, not activation, action authorization, or an execution engine.
 * Callers must still validate every binding and operation before an effect. */
export async function verifyWorkflowPublication(db:Pick<pg.Pool,'query'>,trust:PublisherTrust,
  call:Call,runtimeMatches:(id:string,configuration:unknown)=>Promise<boolean>,
  scope:{pin:WorkflowPublicationPin;installationId:string;entityId:string;actorId:string}):Promise<VerifiedWorkflowPublication>{
  const p=scope.pin;
  requireAuthority(p&&typeof p==='object'&&Object.keys(p).length===8
    &&Object.keys(p).every(k=>['moduleId','moduleInstallationId','packageDigest','publicationId','definitionDigest','reviewId','reviewerId','reviewExpiresAt'].includes(k))
    &&typeof p.moduleId==='string'&&/^[a-z][a-z0-9.-]{0,79}$/.test(p.moduleId)
    &&[p.moduleInstallationId,p.publicationId,p.reviewId,p.reviewerId,scope.installationId,scope.entityId,scope.actorId].every(v=>typeof v==='string'&&uuid.test(v))
    &&hash.test(p.packageDigest)&&hash.test(p.definitionDigest)&&Number.isFinite(Date.parse(p.reviewExpiresAt)), 'WORKFLOW_PUBLICATION_PIN_INVALID');
  const source=(await db.query("SELECT * FROM module_installations WHERE module_id=$1 AND state='active'",[p.moduleId])).rows[0];
  requireAuthority(source,'WORKFLOW_SOURCE_UNAVAILABLE');
  requireAuthority(source.operation_id===p.moduleInstallationId&&digest(canonical(source.descriptor))===p.packageDigest,'WORKFLOW_SOURCE_CHANGED_REVIEW_REQUIRED');
  let manifest;
  try{manifest=verifyPackage(source.descriptor,trust).manifest;}catch{throw Error('WORKFLOW_SOURCE_TRUST_REVOKED');}
  requireAuthority(!manifest.programServices&&!manifest.economicServices,'WORKFLOW_SCOPED_SOURCE_REQUIRES_GOVERNANCE');
  const service=manifest.workflowServices,review=manifest.approvalServices;
  const operation=manifest.api.find(o=>o.operationId===service?.publicationOperationId);
  requireAuthority(service&&review&&operation?.method==='GET'&&operation.query?.includes('q'),'WORKFLOW_PUBLICATION_SERVICE_UNDECLARED');
  requireAuthority(await runtimeMatches(p.moduleId,source.configuration),'WORKFLOW_SOURCE_CONFIGURATION_MISMATCH');
  // The source module does not get to assert current Worker account permissions.
  async function authorized(actor:string,permission:string){return Boolean((await db.query("SELECT 1 FROM security_accounts a WHERE account_id=$1 AND enabled AND (role='local_admin' OR role='module_user' AND EXISTS(SELECT 1 FROM module_permissions mp WHERE mp.account_id=a.account_id AND mp.module_id=$2 AND mp.permission=$3))",[actor,p.moduleId,permission])).rowCount);}
  requireAuthority(await authorized(scope.actorId,operation.permission),'WORKFLOW_REQUESTER_AUTHORITY_REVOKED');
  requireAuthority(await authorized(p.reviewerId,review.reviewerPermission),'WORKFLOW_REVIEWER_AUTHORITY_REVOKED');
  const response=await call(p.moduleId,'GET',operation.path+'?q='+encodeURIComponent(p.publicationId),undefined,
    {'x-steward-actor':scope.actorId,'x-steward-permissions':JSON.stringify([operation.permission]),'x-steward-installation':scope.installationId},4000);
  requireAuthority(response.status===200&&Array.isArray(response.value?.records)&&response.value.records.length===1,'WORKFLOW_PUBLICATION_UNAVAILABLE');
  const row=response.value.records[0],definition=row?.definition,r=row?.review;
  requireAuthority(row?.id===p.publicationId&&row.ownerEntityId===scope.entityId,'WORKFLOW_PUBLICATION_SCOPE_MISMATCH');
  requireAuthority(row.executionAllowed===true,'WORKFLOW_SOURCE_POLICY_REVIEW_REQUIRED');
  requireAuthority(definition&&Buffer.byteLength(canonical(definition))<=98304&&row.definitionDigest===p.definitionDigest&&digest(canonical(definition))===p.definitionDigest,'WORKFLOW_PUBLICATION_CHANGED');
  requireAuthority(r?.id===p.reviewId&&r.decision==='approve'&&r.reviewerId===p.reviewerId&&r.expiresAt===p.reviewExpiresAt,'WORKFLOW_REVIEW_CHANGED_REVIEW_REQUIRED');
  requireAuthority([row.publishedBy,row.authorId,row.editorId].every(v=>typeof v==='string'&&uuid.test(v))
    &&![row.publishedBy,row.authorId,row.editorId].includes(p.reviewerId),'WORKFLOW_SEPARATE_REVIEW_REQUIRED');
  // Read the authoritative clock after transport, so an approval expiring while
  // the module is responding cannot authorize the next effect.
  const now=new Date((await db.query('SELECT clock_timestamp() AS now')).rows[0].now).getTime();
  const published=Date.parse(row.publishedAt),reviewed=Date.parse(r.reviewedAt),expires=Date.parse(r.expiresAt);
  requireAuthority(Number.isFinite(now)&&Number.isFinite(published)&&Number.isFinite(reviewed)
    &&published<=reviewed&&reviewed<=now&&expires>now&&expires-reviewed<=31*86400000,'WORKFLOW_REVIEW_EXPIRED_OR_INVALID');
  requireAuthority(definition.contractVersion===1&&definition.consumerId===p.moduleId&&uuid.test(definition.workflowId)
    &&Number.isSafeInteger(definition.version)&&definition.version>0&&definition.version<=10000
    &&definition.trigger?.kind==='manual'&&definition.trigger.input?.type==='object','WORKFLOW_PUBLICATION_DEFINITION_INVALID');
  validateWorkflowGraph(definition.graph,definition.fields);
  // Revalidate after the network boundary; revoked permission is never retained
  // merely because a previous query or a cached publication succeeded.
  requireAuthority(await authorized(scope.actorId,operation.permission),'WORKFLOW_REQUESTER_AUTHORITY_REVOKED');
  requireAuthority(await authorized(p.reviewerId,review.reviewerPermission),'WORKFLOW_REVIEWER_AUTHORITY_REVOKED');
  const current=(await db.query("SELECT * FROM module_installations WHERE module_id=$1 AND state='active'",[p.moduleId])).rows[0];
  requireAuthority(current&&current.operation_id===p.moduleInstallationId&&digest(canonical(current.descriptor))===p.packageDigest
    &&canonical(current.configuration)===canonical(source.configuration),'WORKFLOW_SOURCE_CHANGED_REVIEW_REQUIRED');
  return definition;
}
