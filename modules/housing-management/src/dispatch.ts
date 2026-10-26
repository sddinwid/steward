import {enqueueCapability,ensure,type Context,type Data,type RecordValue} from '@steward/business-kit';
import {hasProgramAccess} from '@steward/mission-kit';
import {validateCommand} from '@steward/module-sdk';
import {uuid} from './contracts.js';
import {randomUUID} from 'node:crypto';
import type {IntegrationCommand} from '@steward/module-sdk';
export async function enqueueProperty(ctx:Context,program:RecordValue,operation:string,recordId:string,payload:Data){
 ensure(['verify','catalog'].includes(operation),'Unknown property observation',400);
 const aggregateId=randomUUID(),commandId=await enqueueCapability(ctx,'property.authority',operation,aggregateId,payload);
 const command=(await ctx.db.query('SELECT envelope FROM integration_outbox WHERE command_id=$1',[commandId])).rows[0].envelope;
 await ctx.db.query('INSERT INTO housing_dispatch_authority(command_id,command_digest,actor_id,source_program_id,destination_program_id,destination_installation_id,destination_entity_id,provider_module_id,record_id,record_kind,read_aggregate_id,read_operation,observation_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,2)',[commandId,validateCommand(command),ctx.actor,program.id,program.data.assetAuthorityProgramId,program.data.assetAuthorityInstallationId,program.data.assetAuthorityEntityId,program.data.assetAuthorityModuleId,recordId,operation==='catalog'?'program':'property-reference',aggregateId,operation]);return commandId;
}
export async function propertyDispatch(ctx:Context,command:IntegrationCommand){const r=(await ctx.db.query('SELECT * FROM housing_dispatch_authority WHERE command_id=$1',[command.commandId])).rows[0];ensure(r&&r.command_digest===validateCommand(command)&&r.read_aggregate_id===command.aggregateId&&r.read_operation===command.capability?.operation&&r.source_program_id===command.payload.sourceProgramId&&r.destination_program_id===command.payload.programId&&r.record_id&&r.record_kind,'Property observation receipt is unavailable or conflicts with its immutable dispatch',409);return r as Data;}
export async function dispatchAuthority(ctx:Context,q?:Record<string,string>){
 ensure(typeof q?.q==='string'&&new RegExp(uuid.pattern).test(q.q),'Invalid dispatch authority request',400);
 const r=(await ctx.db.query('SELECT * FROM housing_dispatch_authority WHERE command_id=$1',[q.q])).rows[0];ensure(r,'Dispatch authority unavailable',403);
 ensure(await hasProgramAccess(ctx,r.source_program_id,'program.manage')&&await hasProgramAccess({...ctx,actor:r.actor_id},r.source_program_id,'housing.write'),'Dispatch authority unavailable',403);
 return {commandId:r.command_id,commandDigest:r.command_digest,sourceProgramId:r.source_program_id,destinationProgramId:r.destination_program_id,destinationInstallationId:r.destination_installation_id,destinationEntityId:r.destination_entity_id,providerModuleId:r.provider_module_id,authorized:true};
}
