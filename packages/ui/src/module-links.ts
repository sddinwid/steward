import type {ScreenContribution} from '@steward/module-sdk';
import type {DiscoveredModule} from './modules.js';
import {screenGroup} from './presentation.js';
export const recordIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function screenDestination(modules:DiscoveredModule[],moduleId:string,screenId:string,recordId?:unknown){
 const m=modules.find(m=>m.moduleId===moduleId),s=m?.ui.find(s=>s.screenId===screenId),op=m?.api.find(a=>a.operationId===s?.listOperation&&a.method==='GET'&&!a.path.includes(':'));
 if(!s||!op)return null;
 if(recordId!==undefined&&(!(typeof recordId==='string'&&recordIdPattern.test(recordId))||s.contextFilter!=='recordId'||!op.query?.includes('recordId')))return null;
 const group=screenGroup(m!,s),workspace=['Connections','Administration'].includes(group)?'administration':group==='Integration diagnostics'?'developer':'business';
 return '#/'+workspace+'/module/'+moduleId+'/'+screenId+(recordId===undefined?'':'?recordId='+encodeURIComponent(recordId));
}
export function screenContext(screen:ScreenContribution,hash:string){const params=new URLSearchParams(hash.split('?')[1]??'');if(!params.size)return {value:undefined,error:''};const values=params.getAll('recordId');if(screen.contextFilter!=='recordId'||params.size!==1||values.length!==1||!recordIdPattern.test(values[0]!))return{value:undefined,error:'This record link is invalid or unsupported. Open the unfiltered page to continue.'};return{value:values[0],error:''};}
