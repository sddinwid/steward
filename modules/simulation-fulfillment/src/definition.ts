import type pg from 'pg';
import {ensure,find,save,records,publicRecord,transaction,enqueueCapability,setSimulationContext,simulationEpoch,resetSimulationDataset,type Definition,type Data,type Context} from '@steward/business-kit';
import {canonical,type ModulePackageManifest} from '@steward/module-sdk';
import {contracts} from '@steward/commerce-kit';
import {sampleOrder,simulationContracts,random} from '@steward/simulation-kit';

function scoped(ctx:Context,b:Data){ensure(ctx.simulation&&ctx.config.integrationsEnabled===true,'SIMULATION_PROVIDER_NOT_ENABLED',403);if(b.datasetId)ensure(b.datasetId===ctx.simulation.datasetId&&b.runId===ctx.simulation.runId,'SIMULATION_PROVIDER_SCOPE_MISMATCH',403);}
/** An isolated local capability provider: deliberately no remote HTTP client or credentials. */
export function simulationFulfillment(manifest:ModulePackageManifest):Definition{return{manifest,resources:[],actions:[],queries:[
 {path:'/jobs',run:async ctx=>({records:(await records(ctx,'job')).slice(-20).map(publicRecord),summary:'Synthetic production only. No commercial provider calls.'})},
 {path:'/datasets',run:async ctx=>({records:(await records(ctx,'catalog')).map(publicRecord)})}],receive:async(command,ctx)=>{
 const b=command.payload as Data;scoped(ctx,b);const s=ctx.simulation!,catalogKey=s.datasetId+':'+s.runId;
 if(command.command==='simulation.dataset.begin')return{begun:true};
 if(command.command==='simulation.dataset.reset')return resetSimulationDataset(ctx,b);
 if(command.command==='simulation.production.configure'){
  const previous=await find(ctx,'catalog',catalogKey);if(previous)ensure(canonical(previous.data.items)===canonical(b.catalog),'Synthetic provider catalog changed; reset the dataset before replacement',409);else await save(ctx,'catalog',catalogKey,{items:b.catalog});return{configured:true};
 }
 const key=command.sourceModuleId+':'+b.orderId,previous=await find(ctx,'job',key);
 if(command.command==='fulfillment.cancel'){
  if(!previous)return{canceled:true};if(!['awaiting_authorization','pending'].includes(previous.data.status))return{canceled:false};await save(ctx,'job',key,{...previous.data,status:'canceled',updatedAt:new Date().toISOString()},previous);return{canceled:true};
 }
 ensure(command.command==='fulfillment.submit'&&b.orderId===command.aggregateId&&b.currency==='USD','SIMULATION_PRODUCTION_INTENT_INVALID',403);
 if(previous){ensure(canonical(previous.data.lines)===canonical(b.lines),'Synthetic job identity conflict',409);return{jobId:previous.id,status:'awaiting_authorization'};}
 const catalog=await find(ctx,'catalog',catalogKey);ensure(catalog,'SIMULATION_PROVIDER_CATALOG_REQUIRED',409);
 let cost=0n;for(const line of b.lines){const item=catalog.data.items.find((p:Data)=>p.sku===line.sku);ensure(item,'SIMULATION_PRODUCT_MAPPING_REQUIRED',422);cost+=BigInt(item.unitCostCents)*BigInt(line.quantity);}
 if(s.scenario==='low-margin')cost=cost*31n/10n;
 const variance=ctx.config.expenseVariationBasisPoints??500;cost=cost*BigInt(10000-variance+Math.floor(random(s.seed,s.eventIndex,'supplier-cost')*(2*variance+1)))/10000n;
 const productionCostCents=Number(cost);ensure(Number.isSafeInteger(productionCostCents),'Synthetic cost exceeds exact bounds');
 const sample=sampleOrder(s.seed,s.eventIndex,s.scenario,ctx.config),now=new Date().toISOString();
 const job=await save(ctx,'job',key,{orderId:b.orderId,lines:b.lines,currency:'USD',status:'awaiting_authorization',productionCostCents,shippingCostCents:s.scenario==='shipping-increase'?(ctx.config.increasedShippingCents??1600):(ctx.config.shippingMinimumCents??150)+Math.floor(random(s.seed,s.eventIndex,'shipping-expense')*(ctx.config.shippingSpanCents??100)),costBasis:'estimated',dueAt:now,createdAt:now,tracking:null,productionDelaySeconds:sample.productionDelaySeconds,shippingDelaySeconds:sample.shippingDelaySeconds,simulatedCreatedAt:s.simulatedAt});
 return{jobId:job.id,status:'awaiting_authorization'};
}};}
export async function simulationFulfillmentBackground(pool:pg.Pool,runtime:Data){
 if(runtime.configuration.integrationsEnabled!==true)return;
 const jobs=(await pool.query("SELECT id FROM business_records WHERE kind='job' AND data->>'status' IN ('awaiting_authorization','pending','in_production') AND (data->>'dueAt')::timestamptz<=now() ORDER BY created_at LIMIT 8")).rows;
 for(const id of jobs)await transaction(pool,async db=>{
  const row=(await db.query('SELECT * FROM business_records WHERE id=$1 FOR UPDATE',[id.id])).rows[0];if(!row)return;
  const ctx:Context={db,config:runtime.configuration,installationId:runtime.installationId,moduleId:runtime.moduleId,actor:'simulation-provider-runtime',permissions:[]};setSimulationContext(ctx,row.data.simulation);if(!await simulationEpoch(ctx))return;
  const previous=await find(ctx,'job',row.key);if(!previous||Date.parse(previous.data.dueAt)>Date.now())return;
  const status=previous.data.status==='awaiting_authorization'?'pending':previous.data.status==='pending'?'in_production':'shipped';
  const s=ctx.simulation!,delay=status==='pending'?previous.data.productionDelaySeconds:previous.data.shippingDelaySeconds;
  const dueAt=new Date(Date.now()+Math.max(1000,delay*1000/s.speed)).toISOString(),tracking=status==='shipped'?'SIM-'+previous.id:'-';
  await save(ctx,'job',previous.key,{...previous.data,status,dueAt,tracking,updatedAt:new Date().toISOString(),simulatedUpdatedAt:new Date(Date.parse(s.simulatedAt)+(previous.data.productionDelaySeconds+previous.data.shippingDelaySeconds)*1000).toISOString()},previous);
  await enqueueCapability(ctx,simulationContracts.status.id,'fulfillment.progress',previous.data.orderId,{orderId:previous.data.orderId,sourceId:'sim:'+previous.id,status,updatedAt:new Date().toISOString(),productionCostCents:previous.data.productionCostCents,shippingCostCents:previous.data.shippingCostCents,costBasis:'estimated',currency:'USD',tracking});
 });
}
