import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {ModulePackageManifest} from '../../packages/module-sdk/src/index.js';
import {ModuleScreen} from '../../packages/ui/src/modules.js';
import '../../packages/ui/src/style.css';
async function api<T=any>(path:string,method='GET',body?:unknown):Promise<T>{const response=await fetch('/api'+path,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();if(!response.ok)throw Error(value.error??'Catalog operation failed');return value;}
function Fixture(){
 const [manifest,setManifest]=useState<ModulePackageManifest>(),[selected,setSelected]=useState('external-catalog-discovery');
 useEffect(()=>{void fetch('/fixture/manifest').then(r=>r.json()).then(setManifest);},[]);
 const screen=manifest?.ui.find(s=>s.screenId===selected);
 return <div className="application-shell"><main><div className="content module-console"><h1>External Catalog read and import acceptance</h1><p className="notice">Actual Catalog, Shopify and Printify APIs with isolated PostgreSQL. Upstream GraphQL/GET responses, private gateway actors and host receipt routing are explicit synthetic fixtures. No live credentials, external catalog writes, orders or production. This does not establish installed Worker routing or live-store compatibility.</p><button onClick={async()=>{const response=await fetch('/fixture/pump',{method:'POST'});if(!response.ok)throw Error((await response.json()).error);}}>Pump fixture host reads</button><button onClick={async()=>{const response=await fetch('/fixture/fail-source',{method:'POST'});if(!response.ok)throw Error((await response.json()).error);}}>Fixture upstream read fails</button>{manifest?<nav className="app-links" aria-label="Catalog pages">{manifest.ui.map(s=><button type="button" data-screen={s.screenId} key={s.screenId} onClick={()=>setSelected(s.screenId)}>{s.title}</button>)}</nav>:<p>Loading catalog manifest…</p>}{manifest&&screen?<ModuleScreen key={screen.screenId} api={api} module={{moduleId:manifest.moduleId,version:manifest.version,name:manifest.name,api:manifest.api,ui:manifest.ui}} screen={screen} currency="USD"/>:null}</div></main></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
