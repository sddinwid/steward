// Generic signed-module form helpers; no domain module IDs or operational API fixtures.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {moduleFormDefaults,moduleEditValues,referenceOperation,loadReferenceChoices,referenceSelectionValid} from '../packages/ui/dist/module-fields.js';
import {ModuleFormField} from '../packages/ui/dist/module-field.js';
const field={name:'relatedId',label:'Related record',type:'string',required:true,reference:{operationId:'listRelated',valueField:'id',labelField:'name'}};
const operation={operationId:'listRelated',method:'GET',path:'/related',permission:'example.service.read',query:['limit','offset']};
const render=(f,value,reference)=>renderToStaticMarkup(createElement(ModuleFormField,{field:f,value,reference,currency:'USD',onChange:()=>{}}));

test('creation seeds fresh typed synthetic identities while editing preserves identifiers and converts only declared cent values',()=>{
 let n=0;const uuid=()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,fields=[{name:'requestId',label:'Request',type:'string',required:true,generate:'uuid'},{name:'participant',label:'Participant',type:'string',required:true,generate:'synthetic-participant'},{name:'alias',label:'Referral',type:'string',required:true,generate:'synthetic-reference'},{name:'status',label:'Status',type:'string',required:true,default:'draft'}];
 const first=moduleFormDefaults(fields,'EUR',uuid),second=moduleFormDefaults(fields,'EUR',uuid);assert.notEqual(first.requestId,second.requestId);assert.notEqual(first.participant,second.participant);assert.match(first.participant,/^SYN-PART-[A-F0-9]{32}$/);assert.match(first.alias,/^SYNREF-[A-F0-9]{32}$/);assert.equal(first.status,'draft');assert.equal(first.currency,'EUR');
 const record={...first,costCents:12345,quantity:12,revision:7},edited=moduleEditValues(record);assert.equal(edited.participant,first.participant);assert.equal(edited.alias,first.alias);assert.equal(edited.requestId,first.requestId);assert.equal(edited.costCents,123.45);assert.equal(edited.quantity,12);assert.equal(record.costCents,12345);assert.throws(()=>moduleFormDefaults(fields,'USD',()=>''),/secure identifier/);
});

test('references resolve only declared readable same-module operations and direct safe fields',async()=>{
 assert.equal(referenceOperation('example.service',[operation],field)?.path,'/related');let requests=0;const api=async()=>{requests++;return{records:[]};};
 for(const operations of [[],[{...operation,method:'POST'}],[{...operation,path:'/related/:id'}],[{...operation,path:'https://untrusted.invalid/'}],[{...operation,path:'//untrusted.invalid'}],[{...operation,permission:'other.service.read'}]]){const result=await loadReferenceChoices(api,'example.service',operations,field);assert.equal(result.status,'unavailable');assert.deepEqual(result.choices,[]);}
 assert.equal(referenceOperation('example.service',[operation],{...field,reference:{...field.reference,valueField:'constructor'}}),null);assert.equal(requests,0);
});

test('bounded pagination retains at most 200 human choices, stable scalar identities and synthetic labels without case records',async()=>{
 const calls=[];const api=async p=>{calls.push(p);const url=new URL(p,'https://worker.invalid'),offset=Number(url.searchParams.get('offset'));assert.equal(url.searchParams.get('limit'),'20');return{records:Array.from({length:20},(_,i)=>({id:'value-'+(offset+i),name:'Choice '+(offset+i),synthetic:true,privateNotes:'never retain these notes'})),nextOffset:offset+20};};
 const r=await loadReferenceChoices(api,'example.service',[operation],field);assert.equal(r.status,'ready');assert.equal(r.choices.length,200);assert.equal(calls.length,10);assert(r.truncated);assert.equal(r.choices[0].label,'Choice 0 · Synthetic');assert(!JSON.stringify(r).includes('privateNotes'));assert(!JSON.stringify(r).includes('never retain'));assert(calls.every(p=>p.startsWith('/v3/modules/example.service/api/related?')));
});

test('permission loss on a later page clears earlier choices and never echoes a sensitive server error',async()=>{
 let n=0;const r=await loadReferenceChoices(async()=>{if(++n===1)return{records:[{id:'a',name:'Authorized label'}],nextOffset:20};throw Error('403 private case contents');},'example.service',[operation],field);assert.equal(r.status,'unavailable');assert.deepEqual(r.choices,[]);assert(!JSON.stringify(r).includes('private case contents'));
});

test('malformed pages, invalid pagination and unusable labels fail safely without raw JSON labels or looping',async()=>{
 let n=0;const loop=await loadReferenceChoices(async()=>{n++;return{records:[{id:'a',name:'A'}],nextOffset:0};},'example.service',[operation],field);assert.equal(loop.status,'unavailable');assert.equal(n,1);
 const bad=await loadReferenceChoices(async()=>({records:{private:'not a list'}}),'example.service',[operation],field);assert.equal(bad.status,'unavailable');
 const r=await loadReferenceChoices(async()=>({records:[{id:'a',name:{private:'do not stringify'}},{id:'b',name:'Synthetic record'},{id:'b',name:'Duplicate'},{id:'SYNREF-'+'A'.repeat(32),name:'Referral'}],nextOffset:null}),'example.service',[operation],field);assert.equal(r.choices.length,2);assert.match(r.message,/omitted/);assert(!JSON.stringify(r).includes('do not stringify'));assert(!JSON.stringify(r).includes('[object Object]'));assert(r.choices.find(c=>c.value.startsWith('SYNREF')).label.includes('Synthetic'));
});

test('reference controls use exact accessible labels, escaped human options, clear unavailable state and no raw JSON editor',()=>{
 const ready={status:'ready',choices:[{value:'opaque',label:'Synthetic record <img src=x onerror=alert(1)>'}],truncated:false,message:''};const html=render(field,'opaque',ready);assert.match(html,/aria-label="Related record"/);assert.match(html,/<select/);assert.match(html,/&lt;img/);assert(!html.includes('<img'));assert(!html.includes('<textarea'));assert(!html.includes('Advanced'));
 const unavailable=render(field,'',undefined);assert.match(unavailable,/Choices unavailable/);assert.match(unavailable,/You may need permission/);assert.match(unavailable,/disabled/);assert(!unavailable.includes('https://'));
});

test('required new references must be authorized choices; unchanged edit relationships are preserved without silently selecting another record',()=>{
 const state={status:'ready',choices:[{value:'allowed',label:'Allowed'}],truncated:false,message:''};assert(referenceSelectionValid(field,'allowed',state));assert(!referenceSelectionValid(field,'unknown',state));assert(!referenceSelectionValid(field,'',state));assert(referenceSelectionValid({...field,required:false},'',undefined));assert(referenceSelectionValid(field,'retained',undefined,'retained'));assert(!referenceSelectionValid(field,'replacement',undefined,'retained'));
 const html=render(field,'retained',state);assert.match(html,/Current selection unavailable/);assert(!html.includes('selected="" value="allowed"'));
});

test('generated fields stay read-only on edit and legacy amounts/enums preserve shared form formatting',()=>{
 const html=render({name:'identity',label:'Synthetic reference',type:'string',required:true,generate:'synthetic-reference'},'SYNREF-'+'A'.repeat(32));assert.match(html,/readOnly=""/);assert.match(html,/Synthetic identifier only/);assert.match(html,/SYNREF-AAAA/);
 const money=render({name:'costCents',label:'Operating cost Cents',type:'number',required:true,minimum:0},123.45);assert.match(money,/aria-label="Operating cost"/);assert.match(money,/step="0.01"/);assert.match(money,/Amount in USD/);
 const legacy=render({name:'state',label:'State',type:'string',required:true,enum:['draft','approved']},'draft');assert.match(legacy,/<select/);assert.match(legacy,/>draft<\/option>/);
});
