import {Money,ReadableValue} from './presentation.js';
/** Bounded data-only trend renderer shared by independently packaged modules. */
function ReportSeries({series,currency}:{series:any;currency:string}){
 const points=Array.isArray(series?.points)?series.points.slice(-120).filter((p:any)=>p&&typeof p.at==='string'&&Number.isFinite(Date.parse(p.at))&&typeof p.value==='number'&&Number.isFinite(p.value)):[];
 if(!points.length)return null;
 const low=Math.min(0,...points.map((p:any)=>p.value)),high=Math.max(1,...points.map((p:any)=>p.value)),span=high-low;
 const x=(i:number)=>24+i*552/Math.max(1,points.length-1),y=(v:number)=>138-(v-low)*110/span;
 return <figure><figcaption>{typeof series.label==='string'?series.label:'Activity trend'}</figcaption><svg viewBox="0 0 600 160" role="img" aria-label={typeof series.label==='string'?series.label:'Activity trend'}><line x1="24" y1={y(0)} x2="576" y2={y(0)} stroke="#cbd5db"/><polyline fill="none" stroke="#187980" strokeWidth="3" points={points.map((p:any,i:number)=>`${x(i)},${y(p.value)}`).join(' ')}/>{points.map((p:any,i:number)=><circle key={i} cx={x(i)} cy={y(p.value)} r="3" fill="#187980"><title>{p.at}: {p.value}{series.format==='money'?' minor units '+currency:''}</title></circle>)}</svg><details><summary>Underlying trend values</summary><table><thead><tr><th>Processing minute</th><th>Value</th></tr></thead><tbody>{points.map((p:any,i:number)=><tr key={i}><td>{new Date(p.at).toLocaleString()}</td><td>{series.format==='money'?<Money cents={p.value} currency={currency}/>:p.value}</td></tr>)}</tbody></table></details></figure>;
}
/** Data-only contribution from an authorized module response. No markup, scripts or asset URLs. */
export function ModuleReportView({report,currency}:{report:any;currency:string}){
 if(!report||!Array.isArray(report.groups))return null;
 if(report.version!==2)return <details><summary>Module report data</summary><ReadableValue value={report.groups} currency={currency}/></details>;
 return <div>{report.groups.filter((v:any)=>v&&typeof v==='object').slice(0,12).map((group:any,index:number)=><article className="entity-card" key={index}>
  <h3>{typeof group.title==='string'?group.title:'Module report'}</h3>
  {Array.isArray(group.metrics)?<div className="metric-grid">{group.metrics.filter((v:any)=>v&&typeof v==='object').slice(0,24).map((metric:any,i:number)=><article key={i}><span>{typeof metric.label==='string'?metric.label:'Metric'}</span><strong>{metric.format==='money'?<Money cents={metric.value} currency={metric.currency??group.currency??currency}/>:<ReadableValue value={metric.value} currency={group.currency??currency}/>}</strong></article>)}</div>:null}
  {typeof group.description==='string'?<p>{group.description}</p>:null}
  {Array.isArray(group.series)?group.series.slice(0,4).map((series:any,i:number)=><ReportSeries key={i} series={series} currency={group.currency??currency}/>):null}
  {Array.isArray(group.sections)?group.sections.filter((v:any)=>v&&typeof v==='object').slice(0,6).map((section:any,i:number)=><details key={i}><summary>{typeof section.title==='string'?section.title:'Report details'}</summary><ReadableValue value={section.value} currency={group.currency??currency}/></details>):null}
 </article>)}</div>;
}
