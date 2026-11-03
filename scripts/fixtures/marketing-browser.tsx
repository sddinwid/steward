import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ModuleScreen} from '../../packages/ui/src/modules.js';
import '../../packages/ui/src/style.css';
async function api<T=any>(path:string,method='GET',body?:unknown):Promise<T>{const r=await fetch('/api'+path,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const v=await r.json();if(!r.ok)throw Error(v.error??'Marketing request failed');return v;}
function Fixture(){const[m,setM]=useState<any>(),[selected,setSelected]=useState('overview');useEffect(()=>{void fetch('/fixture/manifest').then(r=>r.json()).then(setM);},[]);return <main><h1>Explicit isolated GA4 fixture acceptance</h1><p>No operator data or live Google access.</p>{m?<><nav>{m.ui.map((s:any)=><button key={s.screenId} data-screen={s.screenId} onClick={()=>setSelected(s.screenId)}>{s.title}</button>)}</nav><ModuleScreen key={selected} api={api} module={m} screen={m.ui.find((s:any)=>s.screenId===selected)} currency="USD"/></>:null}</main>;}createRoot(document.getElementById('root')!).render(<Fixture/>);
