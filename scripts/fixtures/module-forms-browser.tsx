// Production renderer, isolated synthetic API fixture. No operator or commerce connections.
import {createRoot} from 'react-dom/client';
import {ModuleScreen} from '../../packages/ui/src/modules.js';
import type {ScreenContribution} from '../../packages/module-sdk/src/index.js';
import '../../packages/ui/src/style.css';
async function api<T=any>(path:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetch('/api'+path,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await response.json();if(!response.ok)throw Error(result.error);return result;
}
const editor:ScreenContribution={screenId:'editor',title:'Typed definitions',navigationLabel:'Typed definitions',navigationGroup:'Synthetic forms',formVersion:1,listOperation:'list',createOperation:'create',fields:[
 {name:'name',label:'Name',type:'string',required:true,maxLength:80},
 {name:'kind',label:'Kind',type:'string',required:true,enum:['product','service'],default:'product'},
 {name:'physical',label:'Physical details',type:'object',required:true,visibleWhen:{field:'kind',equals:'product'},fields:[{name:'weight',label:'Weight',type:'number',minimum:0,required:true}]},
 {name:'components',label:'Components',type:'array',required:true,minItems:1,maxItems:3,items:{name:'component',label:'Component',type:'object',required:true,fields:[{name:'reference',label:'Reference',type:'string',required:true,reference:{operationId:'choices',valueField:'id',labelField:'name'}},{name:'quantity',label:'Quantity',type:'number',minimum:1,required:true},{name:'amount',label:'Amount',type:'number',format:'money',required:true,minimum:0}]}},
 {name:'active',label:'Active',type:'boolean',required:true,default:false},
 {name:'when',label:'Effective time',type:'string',format:'date-time',required:true},
 {name:'currency',label:'Currency',type:'string',required:true,enum:['USD'],default:'USD'},
 {name:'notes',label:'Notes',type:'string',format:'multiline',required:false}
],columns:['name','kind','active']};
const preview:ScreenContribution={screenId:'preview',title:'Resolution preview',navigationLabel:'Resolution preview',formVersion:1,preview:{version:1,operationId:'preview',submitLabel:'Resolve values'},fields:[{name:'amount',label:'Preview amount',type:'number',format:'money',required:true,minimum:0},{name:'currency',label:'Currency',type:'string',required:true,default:'USD',enum:['USD']}],columns:[]};
const module={moduleId:'example.forms',name:'Synthetic generic forms',version:'1.0.0',api:[{operationId:'list',method:'GET' as const,path:'/records',permission:'example.forms.read'},{operationId:'create',method:'POST' as const,path:'/records',permission:'example.forms.write'},{operationId:'choices',method:'GET' as const,path:'/choices',permission:'example.forms.read'},{operationId:'preview',method:'POST' as const,path:'/preview',permission:'example.forms.read'}],ui:[editor,preview]};
createRoot(document.getElementById('root')!).render(<div className="application-shell"><main><div className="content module-console"><h1>Generic SSDS browser fixture</h1><p>Synthetic renderer acceptance only; no business module or live provider.</p><div data-testid="editor-fixture"><ModuleScreen api={api} module={module} screen={editor} currency="USD"/></div><div data-testid="preview-fixture"><ModuleScreen api={api} module={module} screen={preview} currency="USD"/></div><div data-testid="denied-fixture"><ModuleScreen api={api} module={{...module,api:module.api.filter(a=>a.operationId!=='preview')}} screen={{...preview,title:'Unauthorized preview'}} currency="USD"/></div></div></main></div>);
