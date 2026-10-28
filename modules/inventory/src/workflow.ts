import type pg from 'pg';
import type {FastifyInstance} from 'fastify';
import {ensure,type Context,type Data} from '@steward/business-kit';
import {randomUUID} from 'node:crypto';

/** Retain a module-owned shortage observation, without sending a purchasing
 * request. The caller holds the original item lock and commits the pending flag
 * with this record. Existing pending legacy obligations are never redirected. */
export async function recordWorkflowReplenishment(ctx:Context,payload:Data){
 ensure(ctx.config.integrationsEnabled===true&&ctx.config.workflowReplenishmentEnabled===true,'Workflow replenishment is not enabled',403);
 const id=randomUUID();await ctx.db.query('INSERT INTO replenishment_requirements(id,revision,projection) VALUES($1,1,$2)',[id,{...payload,status:'workflow_requested'}]);return id;
}
export function attachWorkflowRequirements(app:FastifyInstance,pool:pg.Pool,runtime:Data){
 app.get('/workflow-requirements',async req=>{
  let permissions:unknown;try{permissions=JSON.parse(String(req.headers['x-steward-permissions']??'[]'));}catch{}
  ensure(Array.isArray(permissions)&&permissions.includes('cee.inventory.read'),'Inventory read permission required',403);
  ensure(runtime.configuration.integrationsEnabled===true&&runtime.configuration.workflowReplenishmentEnabled===true,'Workflow replenishment is not enabled',403);
  return{records:(await pool.query('SELECT id,revision,projection FROM replenishment_requirements ORDER BY id LIMIT 20')).rows};
 });
}
