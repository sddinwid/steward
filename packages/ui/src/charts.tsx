import {useEffect,useRef,useState,lazy,Suspense} from 'react';
import {Money} from './presentation.js';
const Runtime=lazy(()=>import('./chart-runtime.js'));
function Plot({option,label}:{option:any;label:string}){
 const element=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false);
 useEffect(()=>{if(!element.current)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}});observer.observe(element.current);return()=>observer.disconnect();},[]);
 return <div ref={element} className="analytical-plot">{visible?<Suspense fallback={<p role="status">Loading chart… Accessible values are available below.</p>}><Runtime option={option} label={label}/></Suspense>:<p>Interactive chart; accessible values below.</p>}</div>;
}
const display=(v:number|null,money:boolean,currency:string)=>v===null?'Unknown':money?new Intl.NumberFormat('en-US',{style:'currency',currency}).format(v/100):new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v);
export interface ChartSeries{label:string;values:(number|null)[];kind?:'line'|'bar';stack?:string;hidden?:boolean;area?:boolean;dashed?:boolean}
/** Only core-owned chart options are produced from bounded, data-only metadata. */
export function DataChart({title,labels,series,currency='USD',money=false,valueLabel='Count',time=false}:{title:string;labels:string[];series:ChartSeries[];currency?:string;money?:boolean;valueLabel?:string;time?:boolean}){
 const [range,setRange]=useState(0),count=labels.length,start=range?Math.max(0,count-range):0;
 if(!count||!series.length)return <p className="muted">{title}: insufficient observations for visualization.</p>;
 const xs=labels.slice(start,4096),ss=series.slice(0,12).map(s=>({...s,values:s.values.slice(start,4096).map(v=>typeof v==='number'&&Number.isFinite(v)?v:null)}));
 const option={animation:false,aria:{enabled:true,decal:{show:true}},color:['#167a78','#4167b5','#b66b26','#8b62a3','#b33d54'],
  tooltip:{trigger:'axis',renderMode:'richText',valueFormatter:(v:any)=>typeof v==='number'?display(v,money,currency):'Unknown'},
  legend:{top:0,data:ss.filter(s=>!s.hidden).map(s=>s.label),type:'scroll'},grid:{left:80,right:30,top:65,bottom:95},
  xAxis:{type:'category',name:time?'Observation time (UTC)':'Comparison',nameLocation:'middle',nameGap:35,data:xs.map(v=>time?new Date(v).toLocaleDateString('en-US',{timeZone:'UTC'})+' '+(xs.length>1&&Math.abs(Date.parse(xs[1]!)-Date.parse(xs[0]!))<86400000?new Date(v).toLocaleTimeString('en-US',{timeZone:'UTC'}): ''):v),axisLabel:{hideOverlap:true}},
  yAxis:{type:'value',name:money?currency+' (major units)':valueLabel,axisLabel:{formatter:(v:number)=>money?new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(v/100):String(v)}},
  dataZoom:count>20?[{type:'inside'},{type:'slider',bottom:4}]:[],
  series:ss.map(s=>({name:s.label,type:s.kind??'line',data:s.values,connectNulls:false,showSymbol:xs.length<40,symbolSize:7,stack:s.stack,stackStrategy:'all',
   lineStyle:{opacity:s.hidden?0:1,type:s.dashed?'dashed':'solid'},itemStyle:{opacity:s.hidden?0:1},areaStyle:s.area?{opacity:.18}:undefined,tooltip:{show:!s.hidden},emphasis:{focus:'series'}}))};
 return <figure className="analytical-chart"><figcaption><strong>{title}</strong>{time&&count>30?<label>Visible intervals<select aria-label={title+' visible intervals'} value={range} onChange={e=>setRange(Number(e.target.value))}><option value="0">All available</option><option value="30">Last 30 intervals</option><option value="90">Last 90 intervals</option></select></label>:null}</figcaption>
  {count===1?<p className="notice">One observation only. A meaningful trend cannot be established.</p>:null}<Plot option={option} label={title+'; '+valueLabel+(money?' in '+currency:'')}/>
  <details><summary>Accessible chart values and evidence times</summary><div className="comparison-scroll"><table><thead><tr><th>{time?'Observation time':'Comparison'}</th>{ss.filter(s=>!s.hidden).map(s=><th key={s.label}>{s.label}{money?' ('+currency+')':''}</th>)}</tr></thead><tbody>{xs.map((at,i)=><tr key={i}><th scope="row">{at}</th>{ss.filter(s=>!s.hidden).map(s=><td key={s.label}>{display(s.values[i]??null,money,currency)}</td>)}</tr>)}</tbody></table></div></details>
 </figure>;
}
export function ForecastChart({series:s}:{series:any}){
 if(!s?.observations?.length||!s.forecast?.length)return <p className="notice">Forecast unavailable: {s?.warnings?.join(' ')??'Insufficient data.'}</p>;
 const history=s.observations,future=s.forecast,labels=[...history,...future].map((p:any)=>p.at),nil=(n:number)=>Array(n).fill(null);
 const supported=s.uncertainty?.supported===true;
 const data:ChartSeries[]=[{label:'Observed demand',values:[...history.map((p:any)=>p.value),...nil(future.length)]},{label:'Estimated demand',values:[...nil(history.length),...future.map((p:any)=>p.value)],dashed:true}];
 if(supported)data.push({label:'Prediction lower bound',values:[...nil(history.length),...future.map((p:any)=>p.lower)],stack:'interval',hidden:true},
  {label:'Supported prediction interval width',values:[...nil(history.length),...future.map((p:any)=>p.upper-p.lower)],stack:'interval',area:true,hidden:true},
  {label:'Prediction lower',values:[...nil(history.length),...future.map((p:any)=>p.lower)],dashed:true},
  {label:'Prediction upper',values:[...nil(history.length),...future.map((p:any)=>p.upper)],dashed:true});
 return <><DataChart title={'Demand forecast · '+s.key} labels={labels} series={data} valueLabel={s.measure+' per '+s.interval} time/>
 <p>{s.model?.id} · {s.horizon} following {s.interval} intervals · held-out MAE {s.backtesting?.metrics?.mae?.toFixed(2)??'unavailable'} · RMSE {s.backtesting?.metrics?.rmse?.toFixed(2)??'unavailable'}.</p>
 <p>{supported?`${Math.round(s.uncertainty.confidenceLevel*100)}% conditional future-observation intervals; estimates are not guaranteed.`:'Prediction interval unavailable: '+s.uncertainty?.reason}</p>{(s.warnings??[]).map((w:string)=><p className="notice" key={w}>{w}</p>)}</>;
}
export function ProcurementCharts({calculation:c,entities}:{calculation:any;entities:any[]}){
 if(!c||c.proposedCostCents===null)return <p className="notice">No feasible allocation established. {c?.status}</p>;
 const name=(id:string)=>entities.find(e=>e.entity_id===id)?.name??'Authorized participant';
 return <><div className="metric-grid"><article><span>Existing external cost</span><strong><Money cents={c.baselineExternalCents} currency={c.currency}/></strong></article><article><span>Proposed external cost</span><strong><Money cents={c.proposedCostCents} currency={c.currency}/></strong></article><article><span>Estimated benefit · not realized</span><strong><Money cents={c.ecosystemBenefitCents} currency={c.currency}/></strong></article></div>
 <DataChart title="Purchasing cost by company" labels={c.impacts.map((i:any)=>name(i.entityId))} series={[{label:'Existing external cost',kind:'bar',values:c.impacts.map((i:any)=>i.baselineExternalCents)},{label:'Proposed external cost',kind:'bar',values:c.impacts.map((i:any)=>i.proposedCostCents)}]} currency={c.currency} money valueLabel="External cost"/>
 <DataChart title="Proposed external cost allocation" labels={c.impacts.map((i:any)=>name(i.entityId))} series={(['pooledMerchandiseCents','allocatedShippingCents','transitionCostCents'] as const).map((key,n)=>({label:['Merchandise','Allocated shipping','Transition'][n]!,kind:'bar',stack:'cost',values:c.impacts.map((i:any)=>i[key])}))} currency={c.currency} money valueLabel="Cost components"/>
 <div className="comparison-scroll"><table><caption>Entity-level effect · separate consent required</caption><thead><tr><th>Company</th><th>Benefit ({c.currency})</th><th>Human review</th></tr></thead><tbody>{c.impacts.map((i:any)=><tr key={i.entityId}><th>{name(i.entityId)}</th><td><Money cents={i.benefitCents} currency={c.currency}/></td><td>{i.disadvantaged?'Economic disadvantage — explicit review required':'Review assumptions and entity consent'}</td></tr>)}</tbody></table></div>
 <h4>Supplier allocations</h4>{c.suppliers.map((s:any)=><p key={s.id}>{s.id}: {s.quantity} units · {s.unusedCapacity} declared units unused · selected tier {s.tier??'none'}</p>)}<p>{c.status} · {c.solver?.name} {c.solver?.version} · no purchase executed.</p></>;
}
export function RelationshipChart({entities,relationships,hypotheses=[]}:{entities:any[];relationships:any[];hypotheses?:any[]}){
 const ids=new Set(entities.map(e=>e.entity_id)),edges=[...relationships.map(r=>({source:r.from_entity,target:r.to_entity,value:r.kind??'Established',lineStyle:{type:'solid'}})),...hypotheses.map(r=>({source:r.from_entity,target:r.to_entity,value:'Hypothesis: '+r.label,lineStyle:{type:'dashed',color:'#aa7d40'}}))].filter(r=>ids.has(r.source)&&ids.has(r.target));
 if(!edges.length)return <p>No disclosed relationships or evidenced cooperation hypotheses in this account scope.</p>;
 const n=Math.max(1,entities.length),option={animation:false,tooltip:{renderMode:'richText',formatter:(p:any)=>p.dataType==='edge'?p.data.value:p.name},aria:{enabled:true},series:[{type:'graph',layout:'none',roam:true,label:{show:true,position:'bottom'},edgeLabel:{show:true,formatter:(p:any)=>p.data.value},symbolSize:30,data:entities.map((e,i)=>({id:e.entity_id,name:e.name,x:300+220*Math.cos(i*2*Math.PI/n),y:200+140*Math.sin(i*2*Math.PI/n)})),edges,edgeSymbol:['none','arrow'],lineStyle:{width:2,color:'#568982'}}]};
 return <figure><figcaption>Established relationships: solid arrows. Cooperation hypotheses: dashed arrows, requiring review.</figcaption><Plot label="Authorized business relationship graph" option={option}/><details><summary>Accessible relationship list</summary>{edges.map((e,i)=><p key={i}>{entities.find(v=>v.entity_id===e.source)?.name} → {entities.find(v=>v.entity_id===e.target)?.name}: {e.value}</p>)}</details></figure>;
}
