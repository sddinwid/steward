// Reproducible protocol fixture. NEVER a production model or claimed AI provider.
// Run explicitly during verification inside Master, then kill it and restore config.
import {createServer} from 'node:https';
import {readFileSync} from 'node:fs';
const key=readFileSync('/etc/steward/analyst/api-key.txt','utf8').trim();
const ref=r=>({entityId:r.entity_id,moduleId:r.module_id,streamId:r.stream_id,recordId:r.record_id,revision:Number(r.revision)});
const server=createServer({key:readFileSync('/run/secrets/tls_key'),cert:readFileSync('/run/secrets/tls_cert')},(req,res)=>{
 if(req.headers.authorization!=='Bearer '+key){res.writeHead(401);return res.end('{}');}
 let raw='';req.on('data',c=>{raw+=c;if(raw.length>1000000)req.destroy();});req.on('end',()=>{
  try{
   const b=JSON.parse(raw),prompt=b.input.filter(v=>v.role==='user').at(-1).content;const results=b.input.filter(v=>v.type==='function_call_output').map(v=>JSON.parse(v.output).result);
   if(prompt.includes('[fixture:timeout]'))return;
   if(prompt.includes('[fixture:tool-error]'))return calls([{name:'get_entity_summary',arguments:{entityId:'ffffffff-ffff-4fff-8fff-ffffffffffff'}}]);
   if(prompt.includes('[fixture:model-error]')){res.writeHead(503);return res.end('{}');}
   if(prompt.includes('[fixture:malformed]'))return respond([{type:'message',role:'assistant',content:[{type:'output_text',text:'not valid JSON'}]}]);
   if(prompt.includes('[fixture:undeclared]'))return calls([{name:'delete_database',arguments:{}}]);
   if(prompt.includes('[fixture:loop]'))return calls([{name:'list_entities',arguments:{}}]);
   if(prompt.includes('[fixture:budget]'))return calls([{name:'query_resource_matches',arguments:{limit:1,offset:results.length}}]);
   if(b.instructions?.includes('query_commerce_evidence')){
    if(!results.some(v=>v.structuredContent?.data?.entities))return calls([{name:'list_entities',arguments:{}}]);
    const analysis=results.find(v=>v.structuredContent?.data?.calculation)?.structuredContent.data;
    if(!analysis){const pages=results.filter(v=>v.structuredContent?.data?.records?.some(r=>r.reference?.streamId==='commerce_orders')).map(v=>v.structuredContent.data),rows=pages.flatMap(p=>p.records),byEntity=new Map();for(const row of rows)if(!byEntity.has(row.entityId))byEntity.set(row.entityId,row);if(byEntity.size<2){const offset=pages.length?pages.at(-1).nextOffset:0;if(offset===null)throw Error('Insufficient cross-entity commerce evidence');return calls([{name:'query_commerce_evidence',arguments:{status:'fulfilled',limit:4,offset}}]);}return calls([{name:'analyze_commerce_by_id',arguments:{sources:[...byEntity.values()].slice(0,2).map(r=>({recordId:r.reference.recordId,revision:r.reference.revision}))}}]);}
    const c=analysis.calculation;return respond([{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({narrative:'TEST MODEL: observed commerce source evidence and deterministic service output: '+JSON.stringify({displayAmounts:c.displayAmounts,costBasis:c.costBasis,contributionAnalysis:c.contributionAnalysis})+'. Estimates and missing fees are not verified profit. Review supplier and variant differences before any shared purchasing recommendation. No business action was executed.',assumptions:c.assumptions,humanDecisions:['Review source freshness, missing fees, invoices, supplier identity, product equivalence, taxes and both companies consent before pricing, purchasing or production.']})}]}]);
   }
   const business=b.instructions?.includes('query_procurement_matches')?'procurement':b.instructions?.includes('query_workforce_matches')?'workforce':null;
   if(business){
    if(!results.some(v=>v.structuredContent?.data?.entities))return calls([{name:'list_entities',arguments:{}}]);
    const match=results.find(v=>v.structuredContent?.data?.matches)?.structuredContent.data.matches[0];
    if(!match)return calls([{name:business==='procurement'?'query_procurement_matches':'query_workforce_matches',arguments:{limit:1}}]);
    const participant=business==='procurement'?match.first:match.supply;
    if(!results.some(v=>v.structuredContent?.data?.relationships))return calls([{name:'query_business_relationships',arguments:{entityId:participant.entityId,limit:4}}]);
    const analysis=results.find(v=>v.structuredContent?.data?.calculation)?.structuredContent.data;
    if(!analysis){const args={};for(const key of business==='procurement'?['first','second','quote']:['supply','program','demand']){args[key+'RecordId']=match[key].recordId;args[key+'Revision']=match[key].revision;}return calls([{name:business==='procurement'?'analyze_shared_procurement_by_id':'analyze_workforce_opportunity_by_id',arguments:args}]);}
    return respond([{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({narrative:'TEST MODEL: actual MCP evidence and deterministic '+business+' calculation: '+JSON.stringify(analysis.calculation)+'. No business decision executed.',assumptions:['Use the explicit deterministic service assumptions; synthetic scenario only.'],humanDecisions:['Verify source freshness, relationships, consent or commercial terms before human approval.']})}]}]);
   }
   const compact=b.tools.some(t=>t.name==='query_resource_matches')&&!b.tools.some(t=>t.name==='get_entity_summary')||results.some(v=>v.structuredContent?.data?.matches);
   if(compact){
     if(!results.some(v=>v.structuredContent?.data?.entities))return calls([{name:'list_entities',arguments:{}}]);
     const pair=results.find(v=>v.structuredContent?.data?.matches)?.structuredContent.data.matches[0];
     if(!pair)return calls([{name:'query_resource_matches',arguments:{limit:1}}]);
     if(!results.some(v=>v.structuredContent?.data?.relationships))return calls([{name:'query_business_relationships',arguments:{entityId:pair.supply.entityId,limit:4}}]);
     const analysis=results.find(v=>v.structuredContent?.data?.calculation)?.structuredContent.data;
     if(!analysis)return calls([{name:'analyze_resource_sharing_by_id',arguments:{supplyRecordId:pair.supply.recordId,demandRecordId:pair.demand.recordId,supplyRevision:pair.supply.revision,demandRevision:pair.demand.revision,internalMonthlyPayment:3000,incrementalMonthlyCost:1000,transitionExpense:6000,horizonMonths:12,avoidableExternalFraction:1,locationCompatible:true,sensitivity:[{label:'Higher costs',incrementalMonthlyCost:2000,transitionExpense:12000}]}}]);
     return respond([{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({narrative:`TEST MODEL compact investigation: ecosystem ${analysis.calculation.proposal.ecosystemMonthlyBenefit} monthly and ${analysis.calculation.proposal.ecosystemHorizonBenefit} over the horizon; actual authorized sources and deterministic service used.`,assumptions:['Explicit illustrative costs, payment, horizon and conditional site suitability.'],humanDecisions:['Review source freshness, suitability, costs and contracts.']})}]}]);
   }
   const list=results.find(v=>v.structuredContent?.data?.entities&&!v.structuredContent?.data?.records)?.structuredContent.data.entities;
   if(!list)return calls([{name:'list_entities',arguments:{}}]);
   const summaries=results.filter(v=>v.structuredContent?.data?.records).map(v=>v.structuredContent.data);
   if(summaries.length<list.length)return calls(list.filter(e=>!summaries.some(s=>s.entities.some(v=>v.entity_id===e.entity_id))).slice(0,8).map(e=>({name:'get_entity_summary',arguments:{entityId:e.entity_id}})));
   const all=summaries.flatMap(s=>s.records);const pairs=all.filter(r=>r.stream_id==='warehouse_assets'&&Number(r.payload.available_m3)>0).flatMap(s=>all.filter(d=>d.stream_id==='storage_requirements'&&Number(d.payload.monthly_external_cost)>0&&d.entity_id!==s.entity_id&&d.payload.site===s.payload.site&&Number(s.payload.available_m3)>=Number(d.payload.required_m3)).map(d=>({s,d}))).sort((a,b)=>Number(b.d.payload.monthly_external_cost)-Number(a.d.payload.monthly_external_cost));const supply=pairs[0]?.s,demand=pairs[0]?.d;
   if(!supply||!demand)throw new Error('Scenario evidence missing');
   if(!results.some(v=>v.structuredContent?.data?.relationships&&!v.structuredContent?.data?.records))return calls([{name:'get_entity_relationships',arguments:{entityId:supply.entity_id}}]);
   const analysis=results.find(v=>v.structuredContent?.data?.calculation)?.structuredContent.data;
   if(!analysis)return calls([{name:'analyze_resource_sharing',arguments:{supply:ref(supply),demand:ref(demand),assumptions:{internalMonthlyPayment:3000,incrementalMonthlyCost:1000,transitionExpense:6000,horizonMonths:12,avoidableExternalFraction:1,locationCompatible:supply.payload.site===demand.payload.site,sensitivity:[{label:'Higher incremental costs',incrementalMonthlyCost:2000,transitionExpense:12000}]}}}]);
   const c=analysis.calculation;
   respond([{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({narrative:`TEST MODEL investigation using actual synchronized records: share ${c.sharedCapacity} m3. Ecosystem monthly benefit ${c.proposal.ecosystemMonthlyBenefit} ${c.currency}; horizon benefit ${c.proposal.ecosystemHorizonBenefit}. Consumer monthly benefit ${c.proposal.consumerMonthlyBenefit}; provider ${c.proposal.providerMonthlyBenefit}. Internal payments cancel. External storage remains the zero-change alternative. No decision executed.`,assumptions:['Test scenario assumptions: incremental cost 1000 per month, internal payment 3000, transition 6000, 12 months, proportional full external bill avoidance.','Site text equality is insufficient to establish operational suitability.','Synchronized records are non-authoritative; source timestamps and revisions must be reviewed.'],humanDecisions:['Confirm location, actual incremental costs, lease cancellation, service levels, transport and tax before approval.']})}]}]);
   function calls(items){respond(items.map((v,i)=>({type:'function_call',call_id:'call_'+results.length+'_'+i,name:v.name,arguments:JSON.stringify(v.arguments)})));}
   function respond(output){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:'fixture',status:'completed',output}));}
  }catch{res.writeHead(500);res.end('{}');}
 });
});
server.listen(9443,'127.0.0.1');
