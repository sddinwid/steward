import {Money,ReadableValue} from './presentation.js';
/** Data-only contribution from an authorized module response. No markup, scripts or asset URLs. */
export function ModuleReportView({report,currency}:{report:any;currency:string}){
 if(!report||!Array.isArray(report.groups))return null;
 if(report.version!==2)return <details><summary>Module report data</summary><ReadableValue value={report.groups} currency={currency}/></details>;
 return <div>{report.groups.filter((v:any)=>v&&typeof v==='object').slice(0,12).map((group:any,index:number)=><article className="entity-card" key={index}>
  <h3>{typeof group.title==='string'?group.title:'Module report'}</h3>
  {Array.isArray(group.metrics)?<div className="metric-grid">{group.metrics.filter((v:any)=>v&&typeof v==='object').slice(0,24).map((metric:any,i:number)=><article key={i}><span>{typeof metric.label==='string'?metric.label:'Metric'}</span><strong>{metric.format==='money'?<Money cents={metric.value} currency={metric.currency??group.currency??currency}/>:<ReadableValue value={metric.value} currency={group.currency??currency}/>}</strong></article>)}</div>:null}
  {typeof group.description==='string'?<p>{group.description}</p>:null}
  {Array.isArray(group.sections)?group.sections.filter((v:any)=>v&&typeof v==='object').slice(0,6).map((section:any,i:number)=><details key={i}><summary>{typeof section.title==='string'?section.title:'Report details'}</summary><ReadableValue value={section.value} currency={group.currency??currency}/></details>):null}
 </article>)}</div>;
}
