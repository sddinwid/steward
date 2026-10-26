import type pg from 'pg';
import {verifyPackage,operationFor,type PublisherTrust,type IntegrationCommand,canonical,digest} from '@steward/module-sdk';
import type {createModuleBroker} from './module-broker.js';
import {fail} from './security/crypto.js';

/** Core approvals cannot substitute an administrator role for module-owned
 * programme membership. The module, through its declared authenticated API,
 * remains authoritative; no cross-database case/ACL reads are permitted. */
export function programAuthority(pool:pg.Pool,broker:Awaited<ReturnType<typeof createModuleBroker>>,trust:()=>Promise<PublisherTrust>){
 return async(actorId:string,moduleId:string,programId:string)=>{
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(programId))fail(403,'Programme authority is unavailable');
  const actor=(await pool.query("SELECT account_id FROM security_accounts WHERE account_id=$1 AND enabled AND role='local_admin'",[actorId])).rows[0];
  const row=(await pool.query("SELECT * FROM module_installations WHERE module_id=$1 AND state='active'",[moduleId])).rows[0];
  if(!actor||!row)fail(403,'Programme authority is unavailable');
  const manifest=verifyPackage(row.descriptor,await trust()).manifest;
  const path='/program-authority?q='+encodeURIComponent(programId),operation=operationFor(manifest,'GET',path);
  if(!operation||operation.operationId!=='programAuthority')fail(403,'Module does not expose governed programme authority');
  const result=await broker('proxy',row.descriptor,row.configuration,{method:'GET',path,permissions:[...new Set(manifest.api.map(o=>o.permission))],actorId});
  if(result.status!==200||result.value?.programId!==programId||result.value?.authorized!==true)fail(403,'Current module programme authority is required');
 };
}

export function dispatchAuthority(pool:pg.Pool,broker:Awaited<ReturnType<typeof createModuleBroker>>,trust:()=>Promise<PublisherTrust>){
 return async(actorId:string,command:IntegrationCommand,audience:{sourceProgramId:string;destinationProgramId:string;destinationInstallationId:string;destinationEntityId:string;providerModuleId:string})=>{
  const row=(await pool.query("SELECT * FROM module_installations WHERE module_id=$1 AND state='active'",[command.sourceModuleId])).rows[0];if(!row)fail(403,'Service dispatch is unavailable');
  const manifest=verifyPackage(row.descriptor,await trust()).manifest;if(!manifest.programServices)return;
  const path='/dispatch-authority?q='+encodeURIComponent(command.commandId),operation=operationFor(manifest,'GET',path);
  if(!operation||operation.operationId!=='dispatchAuthority')fail(403,'Module-owned dispatch authority is required');
  const response=await broker('proxy',row.descriptor,row.configuration,{method:'GET',path,permissions:[...new Set(manifest.api.map(o=>o.permission))],actorId}),r=response.value;
  if(response.status!==200||r?.authorized!==true||r.commandId!==command.commandId||r.commandDigest!==digest(canonical(command))||Object.entries(audience).some(([key,value])=>r[key]!==value))fail(403,'Selected provider differs from the module-reviewed service audience or its current authority');
 };
}
