import {Money,ReadableValue} from './presentation.js';
import {DataChart} from './charts.js';
/** Bounded data-only trend renderer shared by independently packaged modules. */
function ReportSeries({series,currency}:{series:any;currency:string}){
 const points=Array.isArray(series?.points)?series.points.slice(-120).filter((p:any)=>p&&typeof p.at==='string'&&Number.isFinite(Date.parse(p.at))&&typeof p.value==='number'&&Number.isFinite(p.value)):[];
 if(!points.length)return null;
 return <DataChart title={typeof series.label==='string'?series.label:'Observed activity'} labels={points.map((p:any)=>p.at)} series={[{label:typeof series.label==='string'?series.label:'Observed value',values:points.map((p:any)=>p.value)}]} currency={currency} money={series.format==='money'} valueLabel={series.format==='money'?'Amount':'Observed count'} time/>;
}
/** Data-only contribution from an authorized module response. No markup, scripts or asset URLs. */
export function ModuleReportView({report,currency,navigation=[]}:{report:any;currency:string;navigation?:{screenId:string;label:string;href:string}[]}){
 if(!report||!Array.isArray(report.groups))return null;
 if(report.version!==2)return <details><summary>Module report data</summary><ReadableValue value={report.groups} currency={currency}/></details>;
 return <div>{report.groups.filter((v:any)=>v&&typeof v==='object').slice(0,12).map((group:any,index:number)=><article className="entity-card" key={index}>
  <h3>{typeof group.title==='string'?group.title:'Module report'}</h3>
  {typeof group.status==='string'?<p><span className="badge">{group.status}</span></p>:null}
  {Array.isArray(group.navigation)?<nav className="app-links" aria-label="Related module screens">{group.navigation.slice(0,4).map((id:unknown)=>navigation.find(n=>n.screenId===id)).filter(Boolean).map((n:any)=><a key={n.screenId} href={n.href}>{n.label}</a>)}</nav>:null}
  {Array.isArray(group.metrics)?<div className="metric-grid">{group.metrics.filter((v:any)=>v&&typeof v==='object').slice(0,24).map((metric:any,i:number)=><article key={i}><span>{typeof metric.label==='string'?metric.label:'Metric'}</span><strong>{metric.format==='money'?<Money cents={metric.value} currency={metric.currency??group.currency??currency}/>:<ReadableValue value={metric.value} currency={group.currency??currency}/>}</strong></article>)}</div>:null}
  {typeof group.description==='string'?<p>{group.description}</p>:null}
  {Array.isArray(group.series)?group.series.slice(0,8).map((series:any,i:number)=><ReportSeries key={i} series={series} currency={group.currency??currency}/>):null}
  {Array.isArray(group.sections)?group.sections.filter((v:any)=>v&&typeof v==='object').slice(0,6).map((section:any,i:number)=><details key={i}><summary>{typeof section.title==='string'?section.title:'Report details'}</summary><ReadableValue value={section.value} currency={group.currency??currency}/></details>):null}
 </article>)}</div>;
}
