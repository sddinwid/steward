// Browser regression adapter for both the retained foundation UI and workspaces.
const confirmedPages=new WeakSet();
import {screenGroup} from '../packages/ui/dist/presentation.js';
export async function openWorkspace(page,route){await page.goto(new URL('/#'+route,page.url()).href);}
export function moduleNavigation(page){
 const legacy=page.getByRole('navigation',{name:'Module navigation'});
 async function discovered(){return page.evaluate(async()=>{const response=await fetch('/api/v3/modules/discovery',{credentials:'same-origin'});if(!response.ok)throw new Error('Authorized module discovery unavailable');return(await response.json()).modules;});}
 return {count:async()=>await legacy.count()||((await discovered()).some(m=>m.ui.length)?1:0),getByRole:(_role,options)=>{
  const original=legacy.getByRole('button',options);
  async function open(){if(!confirmedPages.has(page)){page.on('dialog',d=>d.accept());confirmedPages.add(page);}if(await legacy.count())return original.click();const modules=await discovered();let selected;for(const m of modules)for(const s of m.ui)if(s.navigationLabel===options.name)selected={m,s};if(!selected)throw new Error('Module screen is absent or unauthorized: '+options.name);const group=screenGroup(selected.m,selected.s),workspace=group==='Connections'?'administration':group==='Integration diagnostics'?'developer':'business';const workspaces=page.getByRole('navigation',{name:'Workspaces',exact:true});await workspaces.getByRole('link',{name:workspace==='administration'?'Administration':workspace==='developer'?'Developer':'Business',exact:true}).click();const destination=page.locator('aside a[href="#/'+workspace+'/module/'+selected.m.moduleId+'/'+selected.s.screenId+'"]');for(const details of await destination.locator('xpath=ancestor::details').all()){if(await details.getAttribute('open')===null)await details.locator(':scope > summary').click();}await destination.click();await page.getByTestId('module-screen-'+selected.m.moduleId).waitFor();}
  return {click:open,waitFor:open,count:async()=>await legacy.count()?original.count():(await discovered()).flatMap(m=>m.ui).filter(s=>s.navigationLabel===options.name).length};
 }};
}
export async function fillAdvancedJson(container,label,value){const field=container.getByLabel(label,{exact:true});await field.waitFor({state:'attached'});for(const details of await field.locator('xpath=ancestor::details').all()){if(await details.getAttribute('open')===null)await details.locator(':scope > summary').click();}await field.fill(value);}
// Exercise the same ordinary controls used by business users, without JSON editors.
export async function fillBusinessFields(view,body){
 for(const field of view.contribution.fields.filter(f=>!f.readOnly)){
  const value=body[field.name];if(value===undefined)throw new Error('Missing browser form value '+field.name);
  if(field.type==='json'){
   const editor=view.section.locator('.module-field').filter({has:view.page.getByText(field.label,{exact:true})});
   if(field.name==='lines'){
    while(await editor.getByRole('button',{name:/^Remove line /}).count())await editor.getByRole('button',{name:/^Remove line /}).first().click();
    for(let i=0;i<value.length;i++){await editor.getByRole('button',{name:'Add line item',exact:true}).click();for(const [key,v]of Object.entries(value[i])){const label=key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\b\w/g,c=>c.toUpperCase()).replace(/ Cents$/,'');await editor.getByLabel(field.label+' '+label+' '+(i+1),{exact:true}).fill(String(key.endsWith('Cents')?Number(v)/100:v));}}
    if(value.length&&value.every(r=>r.unitPriceCents===undefined))await editor.getByRole('button',{name:'Use quantity only',exact:true}).first().click();
   }else await editor.getByLabel('Values, separated by commas',{exact:true}).fill(value.join(', '));
  }else{const input=view.section.getByLabel(field.label.replace(/ Cents$/,''),{exact:true});if(field.enum)await input.selectOption(String(value));else await input.fill(String(field.name.endsWith('Cents')?Number(value)/100:value));}
 }
}
