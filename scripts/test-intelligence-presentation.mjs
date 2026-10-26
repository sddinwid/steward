import {ModuleReportView} from '../packages/ui/dist/module-report.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {priorityOrder,FindingPreview} from '../packages/ui/dist/intelligence.js';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DataChart,ForecastChart,RelationshipChart} from '../packages/ui/dist/charts.js';

test('shared charts expose sparse observations, missing amounts and source times without invented trends',()=>{
 const one=renderToStaticMarkup(createElement(DataChart,{title:'Source activity',labels:['2026-01-01T00:00:00Z'],series:[{label:'Orders',values:[1]}],time:true}));
 assert.match(one,/One observation only/);assert.match(one,/Accessible chart values/);assert.match(one,/2026-01-01T00:00:00Z/);
 const missing=renderToStaticMarkup(createElement(DataChart,{title:'Unknown cost',labels:['A'],series:[{label:'Shipping',values:[null]}],money:true,currency:'EUR'}));assert.match(missing,/Unknown/);assert.match(missing,/EUR/);
 assert.match(renderToStaticMarkup(createElement(ForecastChart,{series:{status:'insufficient_data',warnings:['No history']}})),/No history/);
});

test('relationship renderer retains authorized endpoints and distinguishes hypotheses without loading module code',()=>{
 const html=renderToStaticMarkup(createElement(RelationshipChart,{entities:[{entity_id:'a',name:'Company A'},{entity_id:'b',name:'Company B'}],relationships:[{from_entity:'a',to_entity:'b',kind:'supplier'}],hypotheses:[{from_entity:'b',to_entity:'a',label:'shared supplier'},{from_entity:'hidden',to_entity:'a',label:'secret'}]}));
 assert.match(html,/Established relationships: solid/);assert.match(html,/Hypothesis/);assert(!html.includes('secret'));assert(!html.includes('hidden'));
});
test('generated report renderer uses arbitrary module metadata and escapes contributed text',()=>{
 const report={version:2,groups:[{title:'Capacity planning <script>',currency:'USD',metrics:[{label:'Available cubic metres',value:75,format:'number'},{label:'Unconfirmed expense',value:null,format:'money'}],description:'Module-owned capacity evidence',sections:[{title:'Source observations',value:{source:'synthetic'}}]}]};
 const html=renderToStaticMarkup(createElement(ModuleReportView,{report,currency:'USD'}));assert(html.includes('Available cubic metres'));assert(html.includes('75'));assert(html.includes('Unknown'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));assert(!html.includes('Commerce overview'));assert.equal(renderToStaticMarkup(createElement(ModuleReportView,{report:{version:2,groups:null},currency:'USD'})),'');
});

test('module report navigation resolves only discovered permitted screen identities',()=>{
 const report={version:2,groups:[{title:'Generic module controls',status:'Paused',navigation:['control','https://untrusted.invalid'],metrics:[]}]};
 const html=renderToStaticMarkup(createElement(ModuleReportView,{report,currency:'USD',navigation:[{screenId:'control',label:'Open permitted controls',href:'#/business/module/example/control'}]}));
 assert(html.includes('Open permitted controls'));assert(html.includes('Paused'));assert(!html.includes('untrusted.invalid'));
});
test('executive priority uses review status and explicit severity, never invented monetary comparisons',()=>{
 const make=(finding_id,status,severity,created_at)=>({finding_id,status,severity,created_at});
 const rows=[make('closed','closed','critical','2026-10-24'),make('info','open','info','2026-10-24'),make('old-critical','open','critical','2026-10-20'),make('critical','open','critical','2026-10-24')];
 assert.deepEqual(rows.sort(priorityOrder).map(r=>r.finding_id),['critical','old-critical','info','closed']);
});
test('unknown severity and timestamps do not fabricate urgency; identity breaks ties deterministically',()=>{
 const a={finding_id:'a',status:'open',severity:null,created_at:null},b={...a,finding_id:'b'};
 assert(priorityOrder(a,b)<0);assert(priorityOrder(b,a)>0);
});
test('executive opportunities visibly distinguish test models without inventing monetary impact',()=>{
 const finding={finding_id:'f',severity:'info',status:'open',affected_entities:[]};
 const render=test_model=>renderToStaticMarkup(createElement(FindingPreview,{finding,run:{test_model,title:'Retained result',impacts:[]},entities:[]}));
 assert.match(render(true),/TEST MODEL/);assert.match(render(true),/Financial impact unavailable/);assert.doesNotMatch(render(false),/TEST MODEL/);
});

import {configurationErrorMessage,saveModuleConfiguration,moduleInstallIntent} from '../packages/ui/dist/module-configuration.js';
test('failed package recovery distinguishes newer active-runtime replacement from a compatible retained package',()=>{
 assert.deepEqual(moduleInstallIntent({version:'1.3.1',state:'failed'},'1.3.2'),{upgrade:true,recover:true});
 assert.deepEqual(moduleInstallIntent({version:'1.3.1',state:'failed'},'1.3.0'),{upgrade:false,recover:true});
 assert.deepEqual(moduleInstallIntent({version:'1.9.0',state:'failed'},'1.10.0'),{upgrade:true,recover:true});
 assert.deepEqual(moduleInstallIntent({version:'1.3.0',state:'active'},'1.3.2'),{upgrade:true});
});
test('module save confirms persisted values and never presents rejected or stale saves as success',async()=>{
 const mode={mode:'live',currency:'USD'};let calls=0;
 await assert.rejects(saveModuleConfiguration(async()=>{calls++;throw Error('CONNECTOR_EGRESS_GRANT_REQUIRED');},'cee.shopify',mode),/GRANT_REQUIRED/);assert.equal(calls,1);
 await assert.rejects(saveModuleConfiguration(async(p)=>p==='/v3/modules'?{installed:[{moduleId:'cee.shopify',configuration:{mode:'simulator'}}]}:{saved:true},'cee.shopify',mode),/NOT_CONFIRMED/);
 const saved=await saveModuleConfiguration(async(p)=>p==='/v3/modules'?{installed:[{moduleId:'cee.shopify',configuration:{currency:'USD',mode:'live'}}]}:{saved:true},'cee.shopify',mode);assert.equal(saved.configuration.mode,'live');
 for(const code of ['CONNECTOR_EGRESS_GRANT_REQUIRED','CONNECTOR_PRIVATE_CONFIGURATION_REQUIRED','CONNECTOR_PRIVATE_CONFIGURATION_INVALID'])assert(configurationErrorMessage(code).startsWith('Not saved.'));
 assert(!configurationErrorMessage('private-value').includes('private-value'));
});
