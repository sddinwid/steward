import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AnalystWorkspace} from '../../packages/ui/src/analyst.js';
import {FindingsReview} from '../../packages/ui/src/findings.js';
import '../../packages/ui/src/style.css';
async function api<T=any>(path:string,method='GET',body?:unknown):Promise<T>{const r=await fetch('/api'+path,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),v=await r.json();if(!r.ok)throw Object.assign(Error(v.error??'Analytical request failed'),{statusCode:r.status});return v;}
function Fixture(){const[hash,setHash]=useState(location.hash);useEffect(()=>{const changed=()=>setHash(location.hash);addEventListener('hashchange',changed);return()=>removeEventListener('hashchange',changed);},[]);const finding=hash.match(/^#\/business\/findings\/([^/]+)$/)?.[1];return <div className="application-shell security-console"><main><div className="content"><h1>Catalog and Pricing Analyst acceptance</h1><p className="notice">Isolated actual Master APIs, PostgreSQL, session/CSRF, signed Worker exchanges, MCP and an explicitly identified protocol test model. Generated source publications test analytical behavior; they establish no live AI quality, installed package routing, provider connectivity or operational authority.</p>{finding?<FindingsReview api={api} master administrator id={finding}/>:<AnalystWorkspace api={api}/>}</div></main></div>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
