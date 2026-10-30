export function configurationErrorMessage(code:string):string {
 const guidance:Record<string,string>={
  CONNECTOR_EGRESS_GRANT_REQUIRED:'Not saved. An operator must approve Docker egress for this installed connector image before Live mode can be applied. Private connector credentials must also be configured outside this form.',
  CONNECTOR_EGRESS_GRANT_MISMATCH:'Not saved. The Docker egress grant belongs to another image or installation. An operator must approve the currently installed image.',
  CONNECTOR_EGRESS_NETWORK_REQUIRED:'Not saved. The approved connector Docker network is missing. An operator must restore its approved network.',
  CONNECTOR_EGRESS_NETWORK_UNTRUSTED:'Not saved. The connector network failed ownership or isolation checks. Ask an operator to correct its approved network.',
  CONNECTOR_EGRESS_IDENTITY_CHANGED:'Not saved. Module Host installation identity changed. Ask an operator to inspect its configuration.',
  CONNECTOR_PRIVATE_CONFIGURATION_REQUIRED:'Not saved. The private connector credential file is missing or unreadable. An operator must configure it securely outside this form, then retry.',
  CONNECTOR_PRIVATE_CONFIGURATION_INVALID:'Not saved. The private connector file is invalid JSON or exceeds the supported size. An operator must correct it; do not enter secrets here.',
 };
 return guidance[code]??'Save could not be confirmed. Refresh the saved settings before retrying. Your form may still contain unsaved changes.';
}
const ordered=(v:any):any=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
type InstalledModule = {version:string;state:string;operationId?:string};
/** Match the numeric three-part versions accepted by signed module manifests. */
function versionOrder(a:string,b:string):number|null {
 if(!/^\d+\.\d+\.\d+$/.test(a)||!/^\d+\.\d+\.\d+$/.test(b))return null;
 const left=a.split('.').map(BigInt),right=b.split('.').map(BigInt);
 for(let i=0;i<3;i++){if(left[i]!>right[i]!)return 1;if(left[i]!<right[i]!)return -1;}return 0;
}
/** Presentation eligibility only; the server retains package and lifecycle authority. */
export function moduleInstallAction(installed:InstalledModule|undefined,version:string){
 if(!installed)return {label:'Install',enabled:true,reason:''};
 const order=versionOrder(version,installed.version),recover=['failed','installing'].includes(installed.state);
 if(order===null)return {label:'Unavailable',enabled:false,reason:'Package versions cannot be compared.'};
 if(recover)return {label:'Recover',enabled:true,reason:order>0?'Recover with a newer package version.':order===0?'Retry the original installation operation.':'Recover with a retained compatible package; server recovery checks still apply.'};
 if(order<0)return {label:'Older version',enabled:false,reason:'Installed version '+installed.version+' is newer. Downgrades are not offered here.'};
 if(order===0)return {label:'Installed',enabled:false,reason:'This version is already installed. Manage its configuration and activation above.'};
 return {label:'Upgrade to',enabled:true,reason:''};
}
export function moduleInstallIntent(installed:InstalledModule|undefined,version:string){
 const action=moduleInstallAction(installed,version);
 if(!action.enabled)throw Error(action.reason);
 const recover=!!installed&&['failed','installing'].includes(installed.state);
 return{upgrade:!!installed&&versionOrder(version,installed.version)===1,...(recover?{recover:true}:{}),...(recover&&installed.version===version&&installed.operationId?{operationId:installed.operationId}:{})};
}
export async function saveModuleConfiguration(api:(path:string,method?:string,body?:unknown)=>Promise<any>,moduleId:string,configuration:unknown){
 const result=await api(`/v3/modules/${encodeURIComponent(moduleId)}/configuration`,'PUT',{configuration});
 if(result.saved!==true)throw Error('CONFIGURATION_SAVE_NOT_CONFIRMED');
 const current=(await api('/v3/modules')).installed.find((m:any)=>m.moduleId===moduleId);
 if(!current||JSON.stringify(ordered(current.configuration))!==JSON.stringify(ordered(configuration)))throw Error('CONFIGURATION_SAVE_NOT_CONFIRMED');
 return current;
}
