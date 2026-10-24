import {test} from 'node:test';
import assert from 'node:assert/strict';
import {priorityOrder,FindingPreview} from '../packages/ui/dist/intelligence.js';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
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
