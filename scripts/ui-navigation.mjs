// Browser regression adapter for both the retained foundation UI and workspaces.
import {screenGroup} from '../packages/ui/dist/presentation.js';
export async function openWorkspace(page,route){await page.goto(new URL('/#'+route,page.url()).href);}
export function moduleNavigation(page){
 const legacy=page.getByRole('navigation',{name:'Module navigation'});
 async function discovered(){return page.evaluate(async()=>{const response=await fetch('/api/v3/modules/discovery',{credentials:'same-origin'});if(!response.ok)throw new Error('Authorized module discovery unavailable');return(await response.json()).modules;});}
 return {count:async()=>await legacy.count()||((await discovered()).some(m=>m.ui.length)?1:0),getByRole:(_role,options)=>{
  const original=legacy.getByRole('button',options);
  async function open(){if(await legacy.count())return original.click();const modules=await discovered();let selected;for(const m of modules)for(const s of m.ui)if(s.navigationLabel===options.name)selected={m,s};if(!selected)throw new Error('Module screen is absent or unauthorized: '+options.name);const group=screenGroup(selected.m,selected.s),workspace=group==='Connections'?'administration':group==='Integration diagnostics'?'developer':'business';const workspaces=page.getByRole('navigation',{name:'Workspaces',exact:true});await workspaces.getByRole('link',{name:workspace==='administration'?'Administration':workspace==='developer'?'Developer':'Business',exact:true}).click();await page.locator('aside a[href="#/'+workspace+'/module/'+selected.m.moduleId+'/'+selected.s.screenId+'"]').click();await page.getByTestId('module-screen-'+selected.m.moduleId).waitFor();}
  return {click:open,waitFor:open,count:async()=>await legacy.count()?original.count():(await discovered()).flatMap(m=>m.ui).filter(s=>s.navigationLabel===options.name).length};
 }};
}
export async function fillAdvancedJson(container,label,value){const field=container.getByLabel(label,{exact:true});for(const details of await field.locator('xpath=ancestor::details').all()){if(await details.getAttribute('open')===null)await details.locator(':scope > summary').click();}await field.fill(value);}
