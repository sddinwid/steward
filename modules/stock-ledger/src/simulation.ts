import {ensure,find,save,records,resetSimulationDataset,type Definition} from '@steward/business-kit';

export function simulationStock(definition:Definition):Definition {
 definition.queries=[...(definition.queries??[]),{path:'/simulation-datasets',run:async ctx=>({records:(await ctx.db.query("SELECT data->'simulation'->>'datasetId' id,count(*)::integer AS records FROM business_records WHERE data ? 'simulation' GROUP BY 1 ORDER BY 1 LIMIT 10")).rows})}];
 const ordinary=definition.receive!;
 definition.receive=async(command,ctx)=>{
  if(!command.command.startsWith('simulation.'))return ordinary(command,ctx);
  const b=command.payload as Record<string,any>,s=ctx.simulation;
  ensure(s&&ctx.config.simulationEnabled===true,'SIMULATION_STOCK_NOT_ENABLED',403);
  ensure(b.datasetId===s.datasetId&&b.runId===s.runId,'SIMULATION_STOCK_SCOPE_MISMATCH',403);
  if(command.command==='simulation.dataset.begin')return{begun:true};
  if(command.command==='simulation.dataset.reset')return resetSimulationDataset(ctx,b);
  if(command.command==='simulation.stock.observe'){
   const belongs=(r:any)=>r.data.simulation?.datasetId===s.datasetId&&r.data.simulation?.runId===s.runId;
   const held=(await records(ctx,'reservation')).filter(belongs).flatMap(r=>r.data.lines),items=(await records(ctx,'item')).filter(belongs).map(r=>{const reserved=held.filter(l=>l.sku===r.data.sku).reduce((n,l)=>n+l.quantity,0);return{sku:r.data.sku,quantity:r.data.quantity,reserved,available:r.data.quantity-reserved};});
   return{datasetId:s.datasetId,runId:s.runId,items,observedAt:new Date().toISOString()};
  }
  ensure(command.command==='simulation.stock.seed','Unsupported simulation stock operation',403);
  const resource=definition.resources.find(r=>r.kind==='item')!;
  for(const item of b.items){
   ensure(item.sku.startsWith(`SIM-${s.datasetId.slice(0,8)}-${s.runId.slice(0,8)}-`),'SIMULATION_SKU_SCOPE_MISMATCH',403);
   const previous=await find(ctx,'item',item.sku);
   // New command IDs must not replenish a previously seeded/consumed balance.
   if(previous){ensure(previous.data.initialQuantity===item.quantity&&previous.data.name===item.name,'Simulation catalog changed; reset the selected dataset before replacement',409);continue;}
   const data=resource.prepare?await resource.prepare(item,null,ctx):item;
   await save(ctx,'item',item.sku,{...data,initialQuantity:item.quantity});
  }
  return{seeded:b.items.length};
 };
 return definition;
}
