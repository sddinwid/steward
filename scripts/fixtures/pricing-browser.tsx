import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {ModulePackageManifest} from '../../packages/module-sdk/src/index.js';
import {ModuleScreen} from '../../packages/ui/src/modules.js';
import '../../packages/ui/src/style.css';
function Fixture(){
 const [identity,setIdentity]=useState('configurer'),[selected,setSelected]=useState('overview'),[loaded,setLoaded]=useState<{identity:string;manifest:ModulePackageManifest}>();
 useEffect(()=>{let disposed=false;void fetch('/fixture/manifest?identity='+identity).then(r=>r.json()).then(value=>{if(!disposed)setLoaded(value);});return()=>{disposed=true;};},[identity]);
 async function api<T=any>(path:string,method='GET',body?:unknown):Promise<T>{const response=await fetch('/api'+path,{method,headers:{'content-type':'application/json','x-fixture-identity':identity},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();if(!response.ok)throw Error(value.error??'Pricing operation failed');return value;}
 const manifest=loaded?.identity===identity?loaded.manifest:undefined,screen=manifest?.ui.find(s=>s.screenId===selected);
 return <div className="application-shell"><main><div className="content module-console"><h1>Pricing Management module acceptance</h1><p className="notice">Actual isolated Pricing API and PostgreSQL. Identity choices and fresh reviewer-permission snapshots are private test fixtures, separate from Worker authentication, signed package installation and installed provider routing. All activity is synthetic; no orders or external prices change.</p><label>Fixture identity<select aria-label="Fixture identity" value={identity} onChange={e=>setIdentity(e.target.value)}>{['configurer','proposer','reviewer','activator','viewer'].map(value=><option key={value}>{value}</option>)}</select></label>{manifest?<><nav className="app-links" aria-label="Pricing pages">{manifest.ui.map(s=><button data-screen={s.screenId} key={s.screenId} onClick={()=>setSelected(s.screenId)}>{s.title}</button>)}</nav>{screen?<div data-fixture-current={identity} data-fixture-screen={screen.screenId}><ModuleScreen key={identity+'/'+screen.screenId} api={api} module={{moduleId:manifest.moduleId,version:manifest.version,name:manifest.name,api:manifest.api,ui:manifest.ui}} screen={screen} currency="USD"/></div>:null}</>:<p role="status">Loading permission-filtered fixture identity…</p>}</div></main></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
