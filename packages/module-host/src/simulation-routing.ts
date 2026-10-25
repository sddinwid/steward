import {assertSimulationBoundary,canonical,type IntegrationCommand,type ModulePackageManifest,type SimulationOrigin} from '@steward/module-sdk';
import type pg from 'pg';
export const simulationRoutingMigration=`
CREATE TABLE simulation_origins(module_id text NOT NULL,aggregate_id uuid NOT NULL,origin jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(module_id,aggregate_id));
CREATE TABLE simulation_denials(command_id uuid NOT NULL,source_module text NOT NULL,target_module text NOT NULL,reason text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(command_id,target_module,reason));
`;
type Sql=Pick<pg.PoolClient,'query'>;
export async function protectSimulationRoute(db:Sql,command:IntegrationCommand,source:ModulePackageManifest,target:ModulePackageManifest,configuration:Record<string,unknown>){
 const exists=(await db.query("SELECT to_regclass('simulation_origins') AS relation")).rows[0]?.relation;
 if(!exists){if(command.simulation||source.simulation||target.simulation)throw Error('INTEGRATION_SIMULATION_SCHEMA_REQUIRED');return;}
 const known=(await db.query('SELECT origin FROM simulation_origins WHERE module_id=$1 AND aggregate_id=$2',[source.moduleId,command.aggregateId])).rows[0]?.origin;
 try{assertSimulationBoundary(command,source,target,configuration,known);}catch(e){throw Object.assign(e as Error,{targetModuleId:target.moduleId});}
 if(command.simulation)await rememberSimulationOrigin(db,source.moduleId,command.aggregateId,command.simulation);
}
export async function rememberSimulationOrigin(db:Sql,moduleId:string,aggregateId:string,origin:SimulationOrigin){
 const inserted=await db.query('INSERT INTO simulation_origins(module_id,aggregate_id,origin) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING origin',[moduleId,aggregateId,origin]);
 const persisted=inserted.rows[0]?.origin??(await db.query('SELECT origin FROM simulation_origins WHERE module_id=$1 AND aggregate_id=$2',[moduleId,aggregateId])).rows[0]?.origin;
 if(canonical(persisted)!==canonical(origin))throw Error('INTEGRATION_SIMULATION_PROVENANCE_CHANGED');
}
export async function recordSimulationDenial(db:Sql,command:IntegrationCommand,target:string,reason:string){
 if(!reason.startsWith('INTEGRATION_SIMULATION_'))return;
 await db.query('INSERT INTO simulation_denials(command_id,source_module,target_module,reason) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[command.commandId,command.sourceModuleId,target,reason]);
}
