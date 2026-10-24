import {useState} from 'react';
import {screenGroup,screenLabel} from './presentation.js';
import type {DiscoveredModule} from './modules.js';
export function ModuleNavigation({modules,route,accountId}:{modules:DiscoveredModule[];route:string;accountId:string}){
 const key='steward.navigation.'+accountId;const [query,setQuery]=useState('');
 const [collapsed,setCollapsed]=useState<string[]>(()=>{try{const v=JSON.parse(localStorage.getItem(key)??'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string'):[];}catch{return [];}});
 const screens=modules.flatMap(m=>m.ui.map(s=>({key:m.moduleId+'/'+s.screenId,label:screenLabel(m,s),group:screenGroup(m,s)}))).filter(s=>!['Connections','Integration diagnostics'].includes(s.group));
 const unique=[...new Map(screens.map(s=>[s.key,s])).values()].filter(s=>(s.group+' '+s.label).toLowerCase().includes(query.toLowerCase()));
 return <div className="module-navigation"><label>Find a business page<input aria-label="Find a business page" type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>{[...new Set(unique.map(s=>s.group))].map(g=><details key={g} open={!!query||!collapsed.includes(g)}><summary onClick={e=>{e.preventDefault();if(query)return;setCollapsed(old=>{const next=old.includes(g)?old.filter(v=>v!==g):[...old,g];try{localStorage.setItem(key,JSON.stringify(next));}catch{}return next;});}}>{g}{unique.some(s=>s.group===g&&route.endsWith(s.key))?' · Current':''}</summary>{unique.filter(s=>s.group===g).map(s=><a key={s.key} href={'#/business/module/'+s.key} aria-current={route==='/business/module/'+s.key?'page':undefined}>{s.label}</a>)}</details>)}{!unique.length?<p>No authorized pages match your search.</p>:null}</div>;
}
