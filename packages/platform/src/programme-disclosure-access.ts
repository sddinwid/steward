import type pg from 'pg';
import {verifyMissionDisclosure} from './mission-disclosures.js';
import {fail} from './security/crypto.js';
export interface ProgrammeDisclosureScope {entityId:string;installationId:string;moduleId:string;programId:string;domain?:string}
/** Shared named-account, source-signed authority; registry roles do not grant access. */
export function programmeDisclosureAccess(pool:pg.Pool,masterId:string){
 async function requireProgramme(accountId:string,scope:ProgrammeDisclosureScope,permission:'read'|'calculate'|'publish'='read',stream:'mission_aggregates_v1'|'mission_resources_v1'|'economic_summaries_v1'='mission_aggregates_v1'){
  const rows=(await pool.query(`SELECT l.*,c.public_key FROM mission_disclosure_leases l JOIN enrolled_workers w ON w.installation_id=l.source_installation_id AND w.entity_id=l.source_entity_id JOIN worker_candidates c ON c.installation_id=w.installation_id WHERE l.master_account_id=$1 AND l.source_installation_id=$2 AND l.source_entity_id=$3 AND l.module_id=$4 AND l.program_id=$5 AND l.state='approved' AND l.master_approved_revision=l.revision AND l.master_approved_by=$1 AND l.expires_at>now()`,[accountId,scope.installationId,scope.entityId,scope.moduleId,scope.programId])).rows;
  for(const row of rows){const proof=verifyMissionDisclosure(row.proof,row.public_key,{masterInstallationId:masterId,sourceInstallationId:scope.installationId,sourceEntityId:scope.entityId});const p=proof.payload;if(p.state==='approved'&&p.expiresAt>Date.now()&&p.revision===row.revision&&p.masterAccountId===accountId&&p.permissions.includes(permission)&&p.streams.includes(stream)&&(!scope.domain||scope.domain===p.sourceDomain))return p;}
  fail(404,'Programme analytical evidence unavailable');
 }
 return{requireProgramme};
}
