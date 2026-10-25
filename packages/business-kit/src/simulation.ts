import {sameSimulationDataset,validateSimulationOrigin,type SimulationOrigin} from '@steward/module-sdk';
import {ensure,type Context,type Data} from './index.js';

export function setSimulationContext(ctx:Context,origin:unknown){
 try{validateSimulationOrigin(origin);}catch{ensure(false,'SIMULATION_PROVENANCE_INVALID',403);}
 if(ctx.simulation)ensure(sameSimulationDataset(ctx.simulation,origin as SimulationOrigin),'SIMULATION_PROVENANCE_CHANGED',403);
 if(!ctx.simulation)ctx.simulation=origin as SimulationOrigin;
}
export async function simulationEpoch(ctx:Context,begin=false):Promise<boolean>{
 const s=ctx.simulation;if(!s)return true;
 const previous=(await ctx.db.query('SELECT * FROM simulation_dataset_epochs WHERE dataset_id=$1 FOR UPDATE',[s.datasetId])).rows[0];
 if(!previous){await ctx.db.query("INSERT INTO simulation_dataset_epochs(dataset_id,run_id,state) VALUES($1,$2,'active')",[s.datasetId,s.runId]);return true;}
 if(previous.run_id===s.runId&&previous.state==='active')return true;
 if(begin&&previous.state==='closed'&&previous.run_id!==s.runId){await ctx.db.query("UPDATE simulation_dataset_epochs SET run_id=$2,state='active',updated_at=now() WHERE dataset_id=$1",[s.datasetId,s.runId]);return true;}
 return false;
}
/** Owner-service operation only: never touches another module's database. */
export async function resetSimulationDataset(ctx:Context,payload:Data){
 const s=ctx.simulation;ensure(s&&payload.datasetId===s.datasetId&&payload.runId===s.runId,'SIMULATION_RESET_SCOPE_MISMATCH',403);
 const parameters=[s.datasetId,s.runId];
 const scope="data->'simulation'->>'datasetId'=$1 AND data->'simulation'->>'runId'=$2";
 const result=await ctx.db.query('DELETE FROM business_records WHERE '+scope,parameters);
 await ctx.db.query("UPDATE simulation_dataset_epochs SET state='closed',updated_at=now() WHERE dataset_id=$1 AND run_id=$2",parameters);
 await ctx.db.query("DELETE FROM integration_outbox WHERE envelope->'simulation'->>'datasetId'=$1 AND envelope->'simulation'->>'runId'=$2",parameters);
 await ctx.db.query("DELETE FROM integration_inbox WHERE simulation->>'datasetId'=$1 AND simulation->>'runId'=$2",parameters);
 await ctx.db.query("DELETE FROM business_requests WHERE simulation->>'datasetId'=$1 AND simulation->>'runId'=$2",parameters);
 await ctx.db.query("INSERT INTO business_audit(actor,operation) VALUES($1,'simulation.dataset.reset')",[ctx.actor]);
 return {datasetId:s.datasetId,runId:s.runId,removed:result.rowCount??0};
}

export async function inferSimulationContext(ctx:Context,aggregateId:string){
 if(ctx.simulation)return;
 // Legacy Inventory has dedicated tables rather than business_records. Do not
 // query a missing relation and abort a valid ordinary inventory transaction.
 if(!(await ctx.db.query("SELECT to_regclass('business_records') AS relation")).rows[0]?.relation)return;
 const row=(await ctx.db.query("SELECT data->'simulation' simulation FROM business_records WHERE id=$1",[aggregateId])).rows[0];
 if(row?.simulation)setSimulationContext(ctx,row.simulation);
}
