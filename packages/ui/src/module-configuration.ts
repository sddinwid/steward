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
/** Presentation flags only; the API still validates versions, state and authority. */
export function moduleInstallIntent(installed:{version:string;state:string}|undefined,version:string){
 const recover=!!installed&&['failed','installing'].includes(installed.state);
 const a=version.split('.').map(Number),b=installed?.version.split('.').map(Number);
 const newer=!!b&&a.some((v,i)=>v>b[i]!&&a.slice(0,i).every((n,j)=>n===b[j]));
 return{upgrade:!!installed&&installed.version!==version&&(!recover||newer),...(recover?{recover:true}:{})};
}
export async function saveModuleConfiguration(api:(path:string,method?:string,body?:unknown)=>Promise<any>,moduleId:string,configuration:unknown){
 const result=await api(`/v3/modules/${encodeURIComponent(moduleId)}/configuration`,'PUT',{configuration});
 if(result.saved!==true)throw Error('CONFIGURATION_SAVE_NOT_CONFIRMED');
 const current=(await api('/v3/modules')).installed.find((m:any)=>m.moduleId===moduleId);
 if(!current||JSON.stringify(ordered(current.configuration))!==JSON.stringify(ordered(configuration)))throw Error('CONFIGURATION_SAVE_NOT_CONFIRMED');
 return current;
}
