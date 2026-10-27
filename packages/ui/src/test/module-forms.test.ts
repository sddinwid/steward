import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {ModuleFormField as Field, ScreenContribution} from '@steward/module-sdk';
import {ModuleFormField,ModuleReferenceValue} from '../module-field.js';
import {ModuleScreen,ModuleEvidenceValue} from '../modules.js';
import {screenGroup} from '../presentation.js';
import {moduleDateTimeDisplay,moduleDateTimeValue,moduleFormBody,moduleListQuery,moduleFormDefaults,moduleEditValues,moduleFieldDefault,moduleFieldVisible,moduleReferenceFields,exactMoneyDisplay} from '../module-fields.js';
const item:Field={name:'entry',label:'Component',type:'object',required:true,fields:[{name:'offering',label:'Offering',type:'string',required:true,reference:{operationId:'choices',valueField:'id',labelField:'name'}},{name:'amount',label:'Amount',type:'number',format:'money',minimum:0,required:true},{name:'enabled',label:'Enabled',type:'boolean',required:true,default:true}]};
const components:Field={name:'components',label:'Components',type:'array',required:true,maxItems:3,items:item};
const render=(field:Field,value:any)=>renderToStaticMarkup(createElement(ModuleFormField,{field,value,currency:'USD',onChange:()=>{}}));
test('empty typed object arrays expose add controls without JSON or inferred columns',()=>{
 const markup=render(components,[]);assert.match(markup,/Add components entry/);assert.match(markup,/No entries yet/);assert(!markup.includes('textarea'));assert(!markup.includes('Advanced'));assert(!markup.includes('separated by commas'));
 const entry=moduleFieldDefault(item);assert.deepEqual(entry,{offering:'',amount:'',enabled:true});const populated=render(components,[entry]);assert.match(populated,/Components 1: Component: Offering/);assert(!populated.includes(String.fromCharCode(65533)));assert(!populated.includes(String.fromCharCode(8212)));assert.match(populated,/Offering/);assert.match(populated,/Amount/);assert.match(populated,/Yes/);assert.match(populated,/Choices unavailable/);assert.match(populated,/Remove components entry 1/);
});
test('nested exact money round trips the safe integer boundary without rounding or mutation',()=>{
 const max=Number.MAX_SAFE_INTEGER;assert.equal(exactMoneyDisplay(max),'90071992547409.91');const stored={components:[{offering:'a',amount:max,enabled:true}]};const values=moduleEditValues(stored,[components]);assert.equal((values.components as any)[0].amount,'90071992547409.91');assert.equal(stored.components[0]!.amount,max);
 const choices={'components[].entry.offering':{status:'ready' as const,choices:[{value:'a',label:'Authorized'}],truncated:false,message:''}};
 assert.deepEqual(moduleFormBody([components],values,choices),stored);
 for(const amount of ['1.005','90071992547409.92','',NaN])assert.throws(()=>moduleFormBody([components],{components:[{offering:'a',amount,enabled:true}]},choices));
 assert.throws(()=>moduleFormBody([components],{components:[{offering:'other',amount:'12.34',enabled:true}]},choices),/authorized/);
 assert.throws(()=>moduleFormBody([components],{components:Array.from({length:4},()=>({offering:'a',amount:'1.00',enabled:true}))},choices),/number of entries/);
 assert.deepEqual(moduleReferenceFields([components]).map(v=>v.path),['components[].entry.offering']);
});
test('conditions omit inactive inputs and retain typed false, exact dates and server-owned read-only fields',()=>{
 const fields:Field[]=[{name:'kind',label:'Kind',type:'string',required:true,enum:['product','service']},{name:'physical',label:'Physical',type:'object',required:true,visibleWhen:{field:'kind',equals:'product'},fields:[{name:'weight',label:'Weight',type:'number',required:true}]},{name:'active',label:'Active',type:'boolean',required:true},{name:'when',label:'When',type:'string',format:'date-time',required:true},{name:'owner',label:'Owner',type:'string',required:true,readOnly:true}];
 assert.equal(moduleFieldVisible(fields[1]!,{kind:'service'}),false);assert.deepEqual(moduleFormBody(fields,{kind:'service',physical:{weight:'bad'},active:false,when:'2030-01-01T12:00:00+02:00',owner:'forged'},{}),{kind:'service',active:false,when:'2030-01-01T10:00:00.000Z'});
 assert.throws(()=>moduleFormBody(fields,{kind:'product',physical:{weight:''},active:false,when:'bad'},{}));
 assert.deepEqual(moduleFormDefaults([components], 'USD'),{currency:'USD',components:[]});
 assert.match(render({name:'notes',label:'Notes',type:'string',format:'multiline',required:false},''),/<textarea/);
 assert.match(render({name:'date',label:'Date',type:'string',format:'date',required:true},'2030-01-01'),/type="date"/);
});
test('preview-only screen renders a typed POST form and no creation controls, and signed groups override heuristics',()=>{
 const screen:ScreenContribution={screenId:'preview',title:'Preview',navigationLabel:'Preview',navigationGroup:'Planning',formVersion:1,preview:{version:1,operationId:'preview',submitLabel:'Resolve price'},fields:[{name:'currency',label:'Currency',type:'string',required:true,default:'USD'}],columns:[]};
 const module={moduleId:'example.planning',version:'1.0.0',name:'Planning',api:[{operationId:'preview',method:'POST' as const,path:'/preview',permission:'example.planning.read'}],ui:[screen]};
 const markup=renderToStaticMarkup(createElement(ModuleScreen,{api:async()=>{throw Error('SSR must not fetch');},module,screen,currency:'USD'}));assert.match(markup,/Resolve price/);assert(!markup.includes('Create record'));assert(!markup.includes('Refresh report'));assert(!markup.includes('Loading records'));assert.equal(screenGroup(module,{...screen,screenId:'provider-mapping'}),'Planning');
 const denied=renderToStaticMarkup(createElement(ModuleScreen,{api:async()=>{throw Error('SSR must not fetch');},module:{...module,api:[]},screen,currency:'USD'}));assert(!denied.includes('Resolve price'));
});

test('server filters and reporting dates are sent only when declared, preserving pagination',()=>{
 const operation={operationId:'list',method:'GET' as const,path:'/records',permission:'example.planning.read',query:['q','status','offset'] as const};
 const input={offset:40,q:'name & code',status:'active',from:'2030-01-01T12:00:00Z'};
 const params=new URLSearchParams(moduleListQuery({...operation,query:[...operation.query]},input));assert.equal(params.get('q'),'name & code');assert.equal(params.get('status'),'active');assert.equal(params.get('offset'),'40');assert.equal(params.get('from'),null);assert.equal(params.get('limit'),null);
 assert.equal(moduleListQuery({...operation,query:[]},input),'');assert.throws(()=>moduleListQuery({...operation,query:['from']},{offset:0,from:'bad'}),/reporting date/);
});

test('datetime controls retain typed local input and preserve persisted instants across timezones and DST',()=>{
 const original=process.env.TZ;
 try{
  for(const [zone,winter,summer] of [['America/Los_Angeles','2026-01-01T04:30:00.123','2026-07-01T05:30:00.123'],['Europe/London','2026-01-01T12:30:00.123','2026-07-01T13:30:00.123'],['Asia/Kathmandu','2026-01-01T18:15:00.123','2026-07-01T18:15:00.123'],['UTC','2026-01-01T12:30:00.123','2026-07-01T12:30:00.123']]){
   process.env.TZ=zone!;
   for(const [instant,local] of [['2026-01-01T12:30:00.123Z',winter],['2026-07-01T12:30:00.123Z',summer]]){assert.equal(moduleDateTimeDisplay(instant),local,zone);assert.equal(moduleDateTimeValue(local!),instant,zone);assert.equal(moduleDateTimeDisplay(local),local);}
   assert.equal(moduleDateTimeDisplay('2026-03-08T02:30'),'2026-03-08T02:30');assert.equal(moduleDateTimeDisplay('2026-03-08T'),'2026-03-08T');
  }
  process.env.TZ='America/Los_Angeles';assert.throws(()=>moduleDateTimeValue('2026-03-08T02:30'),/does not exist/);assert.equal(moduleDateTimeValue('2026-03-08T03:30'),'2026-03-08T10:30:00.000Z');
  // Both occurrences display the same wall time; unchanged edits keep their original distinct UTC instants.
  const field:Field={name:'when',label:'When',type:'string',format:'date-time',required:true};
  for(const instant of ['2026-11-01T08:30:00.000Z','2026-11-01T09:30:00.000Z']){assert.equal(moduleDateTimeDisplay(instant),'2026-11-01T01:30:00.000');assert.deepEqual(moduleFormBody([field],moduleEditValues({when:instant},[field]),{}),{when:instant});}
  assert.throws(()=>moduleDateTimeValue('2026-02-30T12:00'),/does not exist/);assert.throws(()=>moduleDateTimeValue('not-a-date'),/Choose a date/);
 }finally{if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
});

test('optional empty object groups omit blank visible values while preserving required groups and zero/false',()=>{
 const field:Field={name:'dimensions',label:'Dimensions',type:'object',required:false,fields:[{name:'length',label:'Length',type:'number',required:true},{name:'unit',label:'Unit',type:'string',required:true}]};
 const emptyMarkup=render(field,{});assert(!emptyMarkup.includes('required=""'));const partialMarkup=render(field,{length:0});assert(partialMarkup.includes('required=""'));
 for(const dimensions of [undefined,null,'',{}, {length:'',unit:null}])assert.deepEqual(moduleFormBody([field],{dimensions},{}),{});
 assert.deepEqual(moduleFormBody([field],{dimensions:{length:0,unit:'cm'}},{}),{dimensions:{length:0,unit:'cm'}});
 assert.throws(()=>moduleFormBody([{...field,required:true}],{dimensions:{}},{}),/Enter Length/);
 const group:Field={name:'options',label:'Options',type:'object',required:false,fields:[{name:'enabled',label:'Enabled',type:'boolean',required:false},{name:'hidden',label:'Hidden',type:'number',required:true,visibleWhen:{field:'enabled',equals:true}}]};
 assert.deepEqual(moduleFormBody([group],{options:{enabled:false,hidden:'bad'}},{}),{options:{enabled:false}});
 const absentController={...group,fields:[{...group.fields![0]!,readOnly:true},group.fields![1]!]};assert.deepEqual(moduleFormBody([absentController],{options:{enabled:false,hidden:'bad'}},{}),{});
 const nested:Field={name:'outer',label:'Outer',type:'object',required:false,fields:[field]};assert.deepEqual(moduleFormBody([nested],{outer:{dimensions:{length:'',unit:''}}},{}),{});
});

test('absent related references show None while a nonempty unavailable identity stays unavailable',()=>{
 for(const value of [undefined,null,'']){const markup=renderToStaticMarkup(createElement(ModuleReferenceValue,{value,reference:undefined}));assert.match(markup,/>None</);assert(!markup.includes('unavailable'));}
 const unavailable=renderToStaticMarkup(createElement(ModuleReferenceValue,{value:'unavailable-nonempty-reference',reference:undefined}));assert.match(unavailable,/Related record unavailable/);assert(!unavailable.includes('>None<'));assert(!unavailable.includes('unavailable-nonempty-reference'));
});

test('opaque generated UUID controls collapse without changing values or hiding meaningful synthetic references',()=>{
 const uuid='00000000-0000-4000-8000-000000000001',field:Field={name:'requestId',label:'Creation request reference',type:'string',required:true,generate:'uuid'};
 const markup=render(field,uuid);assert.match(markup,/<details class="module-field"><summary>Creation request reference<\/summary>/);assert(!markup.includes('<details open'));assert.match(markup,/aria-label="Creation request reference"/);assert.match(markup,/readOnly=""/i);assert(markup.includes('value="'+uuid+'"'));
 assert.deepEqual(moduleFormBody([field],{requestId:uuid},{}),{requestId:uuid});
 for(const generate of ['synthetic-participant','synthetic-reference'] as const){const meaningful=render({...field,generate},'SYN-REFERENCE');assert(!meaningful.includes('<details'));assert(meaningful.includes('SYN-REFERENCE'));}
});

test('only exact semantically named evidence hashes collapse while business strings remain visible',()=>{
 const hash='ab'.repeat(32),display=(name:string,value:unknown)=>renderToStaticMarkup(createElement(ModuleEvidenceValue,{name,value,currency:'USD'}));
 for(const name of ['proof','hash','digest','factsDigest','origin_hash','sourceProof']){const html=display(name,hash);assert.match(html,/<details><summary>Evidence \u00b7 abababab<\/summary><code>/);assert(html.includes(hash));assert(!html.includes('<details open'));}
 for(const [name,value] of [['sku',hash],['name',hash],['proof',hash.slice(1)],['proof','z'.repeat(64)],['proof','ordinary human evidence']] as const){assert(!display(name,value).includes('<details>'));assert(display(name,value).includes(value));}
});
