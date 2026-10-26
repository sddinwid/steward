import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {WorkerMissionDisclosure} from '../packages/ui/dist/mission-workspace.js';
const packages=await Promise.all(['housing-management','participant-services','employment-pathways','services-food','workforce'].map(async name=>JSON.parse(await readFile('modules/'+name+'/manifest.json','utf8'))));
test('Disclosure choices use signed service metadata and authorized API contributions, independent of UI screen naming',()=>{
 const modules=packages.map(m=>({moduleId:m.moduleId,programServices:m.programServices,api:m.api,ui:[]}));
 const markup=renderToStaticMarkup(createElement(WorkerMissionDisclosure,{api:async()=>({records:[]}),modules}));
 for(const m of packages.filter(m=>m.programServices))assert(markup.includes('<option value="'+m.moduleId+'">')||markup.includes('<option>'+m.moduleId+'</option>'));
 assert(!markup.includes('<option>cee.workforce</option>'));
 const denied=renderToStaticMarkup(createElement(WorkerMissionDisclosure,{api:async()=>({records:[]}),modules:modules.map(m=>({...m,api:[]}))}));
 for(const m of modules)assert(!denied.includes('<option>'+m.moduleId+'</option>'));
});
test('Generic module currency inputs are labelled as amounts rather than minor-unit instructions',()=>{
 for(const m of packages.filter(m=>m.programServices))for(const screen of m.ui)for(const f of screen.fields.filter(f=>f.name.endsWith('Cents')&&!f.readOnly))assert(!/\(cents\)|minor currency units/i.test(f.label),m.moduleId+' '+f.name);
 assert(packages[0].ui.find(s=>s.screenId==='programs').actions.some(a=>a.operationId==='reviewProgrammeUpgrade'));
});
