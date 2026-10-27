import type pg from 'pg';
import type {ModulePackageManifest} from '@steward/module-sdk';
/** Read only this Worker's authentication store; financial roles remain module-owned. */
export async function financialAuthorityHeaders(db:Pick<pg.Pool,'query'>,moduleId:string):Promise<Record<string,string>>{
 const row=(await db.query('SELECT descriptor FROM module_installations WHERE module_id=$1',[moduleId])).rows[0];
 if(!row?.descriptor?.payload?.manifest?.economicServices)return{};
 const actors=(await db.query("SELECT a.account_id FROM security_accounts a WHERE a.enabled AND (a.role='local_admin' OR a.role='module_user' AND EXISTS(SELECT 1 FROM module_permissions p WHERE p.account_id=a.account_id AND p.module_id=$1 AND p.permission=$2)) ORDER BY a.account_id LIMIT 257",[moduleId,moduleId+'.admin'])).rows;
 if(actors.length>256)throw Error('FINANCIAL_PRINCIPAL_LIMIT_REACHED');
 return{'x-steward-financial-principals':JSON.stringify({issuedAt:Date.now(),actors:actors.map(r=>r.account_id)})};
}

/** A current authentication snapshot, not a module approval policy or an approval. */
export async function approvalAuthorityHeaders(db:Pick<pg.Pool,'query'>,manifest:ModulePackageManifest):Promise<Record<string,string>>{
 const service=manifest.approvalServices;if(!service)return{};
 const permission=service.reviewerPermission;
 if(service.contractVersion!==1||!permission.startsWith(manifest.moduleId+'.')||!manifest.api.some(op=>op.permission===permission))throw Error('APPROVAL_PERMISSION_UNDECLARED');
 const actors=(await db.query("SELECT a.account_id FROM security_accounts a WHERE a.enabled AND (a.role='local_admin' OR a.role='module_user' AND EXISTS(SELECT 1 FROM module_permissions p WHERE p.account_id=a.account_id AND p.module_id=$1 AND p.permission=$2)) ORDER BY a.account_id LIMIT 257",[manifest.moduleId,permission])).rows;
 if(actors.length>256)throw Error('APPROVAL_PRINCIPAL_LIMIT_REACHED');
 return{'x-steward-approval-principals':JSON.stringify({issuedAt:Date.now(),reviewerPermission:permission,actors:actors.map(r=>r.account_id)})};
}

/** Caller-provided context never supplies either private authentication snapshot. */
export function publicContextHeaders(context:Record<string,string>){return Object.fromEntries(Object.entries(context).filter(([key])=>!['x-steward-financial-principals','x-steward-approval-principals'].includes(key.toLowerCase())));}
