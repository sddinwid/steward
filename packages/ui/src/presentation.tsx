import {createContext,useContext} from 'react';
export const PresentationContext=createContext<{locale:string;baseCurrency?:string|undefined}>({locale:'en-US'});
import type { ScreenContribution } from '@steward/module-sdk';
import type { DiscoveredModule } from './modules.js';
export const humanize=(value:string)=>value.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
export function screenLabel(m:Pick<DiscoveredModule,'name'>,s:ScreenContribution){
 const label=humanize(s.navigationLabel).replace(/^Sales /,'').replace(/^Procurement Requisition$/,'Purchase Requisitions').replace(/^Workforce (People|Person)$/,'Workforce Directory').replace(/^Printify Job$/,'Production Orders');return label.replace(/\bJob\b/g,'Production Orders').replace(/\bOrder\b/g,'Orders').replace(/\bProduct\b/g,'Products').replace(/\bCustomer\b/g,'Customers').replace(/\bSupplier\b/g,'Suppliers').replace(/\bPerson\b/g,'People').replace(/\bFacility\b/g,'Facilities').replace(/\bMapping\b/g,'Product Mapping');
}
export function screenGroup(m:Pick<DiscoveredModule,'name'>,s:ScreenContribution){
 if(s.workspace==='administration')return 'Administration';if(s.workspace==='developer')return 'Integration diagnostics';
 if(s.navigationGroup)return s.navigationGroup;
 const text=(m.name+' '+s.navigationLabel).toLowerCase();
 if(/delivery|integration-status/.test(s.screenId))return 'Integration diagnostics';
 if(/connection|mapping/.test(s.screenId))return 'Connections';
 if(/report/.test(s.screenId))return 'Reports & Analytics';
 if(/shopify/.test(text))return 'Shopify Commerce';if(/printify/.test(text))return 'Printify Production & Fulfillment';
 if(/procurement/.test(text))return 'Procurement';if(/sales/.test(text))return 'Sales & Orders';
 if(/inventory|stock/.test(text))return 'Products & Inventory';if(/workforce|training/.test(text))return 'Workforce & Training';
 if(/asset|facilit|capacity|storage|operations/.test(text))return 'Assets & Facilities';return m.name;
}
export function Money({cents,currency}:{cents:unknown;currency:string}){const preferences=useContext(PresentationContext);if(cents===null||cents===undefined)return <>Unknown</>;if(!Number.isSafeInteger(Number(cents))||!/^[A-Z]{3}$/.test(currency))return <>Unavailable</>;try{return <>{new Intl.NumberFormat(preferences.locale,{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(cents)/100)} <small>{currency}{preferences.baseCurrency&&preferences.baseCurrency!==currency?' · company base '+preferences.baseCurrency+'; unconverted':''}</small></>;}catch{return <>Unavailable</>;}}
export function ReadableValue({value,name='',currency}:{value:any;name?:string;currency?:string | undefined}){
 if(value===null||value===undefined)return <span className="muted">Unknown</span>;
 if(/Cents$/.test(name)&&currency)return <Money cents={value} currency={currency}/>;
 if(typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value)&&Number.isFinite(Date.parse(value)))return <time dateTime={value}>{new Date(value).toLocaleString()}</time>;
 if(typeof value==='boolean')return <>{value?'Yes':'No'}</>;
 if(Array.isArray(value))return value.length?<ul>{value.map((v,i)=><li key={i}><ReadableValue value={v} currency={currency}/></li>)}</ul>:<span className="muted">None</span>;
 if(typeof value==='object')return <dl className="readable-fields">{Object.entries(value).map(([k,v])=><div key={k}><dt>{humanize(k)}</dt><dd><ReadableValue value={v} name={k} currency={value.currency??currency}/></dd></div>)}</dl>;
 return <>{String(value)}</>;
}
export function StructuredValue({label,name,value,required,onChange}:{label:string;name:string;value:any;required:boolean;onChange:(v:any)=>void}){
 let parsed=value;try{if(typeof value==='string')parsed=JSON.parse(value);}catch{parsed=undefined;}
 const rows:any[]=Array.isArray(parsed)?parsed:[];
 const columns=rows[0]&&typeof rows[0]==='object'?Object.keys(rows[0]):name==='lines'?['sku','quantity','unitPriceCents']:[];
 return <div className="structured-editor"><p>{label}</p>{columns.length?<><p className="muted">Enter prices in the transaction currency (for example, 12.50 USD). Use quantity-only lines for fulfillment or receipt records.</p>{rows.map((r,i)=><div className="form-grid" key={i}>{columns.map(k=><label key={k}>{humanize(k).replace(/ Cents$/,'')}<input aria-label={label+' '+humanize(k).replace(/ Cents$/,'')+' '+(i+1)} required={required} type={/quantity|Cents$/.test(k)?'number':'text'} min={/quantity/.test(k)?1:0} step={/Cents$/.test(k)?'0.01':/quantity/.test(k)?'1':undefined} value={/Cents$/.test(k)?Number(r[k]??0)/100:r[k]??''} onChange={e=>onChange(rows.map((row,j)=>j===i?{...row,[k]:/Cents$/.test(k)?Math.round(Number(e.target.value)*100):/quantity/.test(k)?Number(e.target.value):e.target.value}:row))}/></label>)}<button type="button" onClick={()=>onChange(rows.filter((_,j)=>j!==i))}>Remove line {i+1}</button>{Object.hasOwn(r,'unitPriceCents')?<button type="button" onClick={()=>onChange(rows.map(row=>Object.fromEntries(Object.entries(row).filter(([k])=>k!=='unitPriceCents'))))}>Use quantity only</button>:null}</div>)}<button type="button" onClick={()=>onChange([...rows,Object.fromEntries(columns.map(k=>[k,/quantity/.test(k)?1:/Cents$/.test(k)?0:'']))])}>{name==='lines'?'Add line item':'Add '+label.toLowerCase()+' row'}</button></>:<label>Values, separated by commas<input value={rows.join(', ')} onChange={e=>onChange(e.target.value.split(',').map(s=>s.trim()).filter(Boolean))}/></label>}<details><summary>Advanced structured data</summary><textarea aria-label={label} required={required} value={typeof value==='string'?value:JSON.stringify(value??[],null,2)} onChange={e=>onChange(e.target.value)}/></details></div>;
}
export function ConfigurationFields({schema,value,onChange}:{schema:any;value:any;onChange:(v:any)=>void}){return <div className="form-grid">{Object.entries(schema.properties??{}).map(([k,p]:[string,any])=>['string','number','integer','boolean'].includes(p.type)?<label key={k}>{humanize(k)}{p.description?<small>{p.description}</small>:null}{p.enum?<select aria-label={humanize(k)} value={value[k]??''} onChange={e=>onChange({...value,[k]:e.target.value})}><option value="">Select value</option>{p.enum.map((v:string)=><option key={v}>{v}</option>)}</select>:<input aria-label={humanize(k)} type={p.type==='boolean'?'checkbox':p.type==='string'?'text':'number'} checked={p.type==='boolean'?!!value[k]:undefined} value={p.type==='boolean'?undefined:value[k]??''} required={schema.required?.includes(k)} min={p.minimum} max={p.maximum} onChange={e=>onChange({...value,[k]:p.type==='boolean'?e.target.checked:p.type==='string'?e.target.value:Number(e.target.value)})}/>}</label>:<label key={k}>{humanize(k)}<StructuredValue label={humanize(k)} name={k} value={value[k]} required={false} onChange={v=>onChange({...value,[k]:v})}/></label>)}</div>;}
