// Read-only original module database audit around a real idempotent UI rerun.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {digest} from '../packages/module-sdk/dist/index.js';
import {validateJournal} from '../packages/economy-kit/dist/index.js';
import {state,request,report as setup} from './seed-phase14-economy.mjs';
import {compose,directory} from './phase13-acceptance-client.mjs';
assert.equal(setup.status,'passed');assert.equal(Object.keys(state.contributions??{}).length,3);
const resource='steward.finance.resource-availability',budget='steward.finance.mission-budget',coord='steward.finance.resource-coordination';
const instances=[...['worker-1','worker-2'].map(w=>[w,resource]),...['worker-1','worker-2','worker-3'].flatMap(w=>[[w,budget],[w,coord]])];
const query=(w,id,sql)=>execFileSync('docker',['exec',compose('ps','-q',w+'-db'),'psql','-U','postgres','-d','m_'+digest(id).slice(0,20),'-At','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const allowed=['business_records','economic_events','financial_journals','synthetic_settlements','budget_commitments','budget_receipts','resource_holds'];
function snapshot(){return instances.map(([w,id])=>{const tables=query(w,id,"SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").split('\n').filter(t=>allowed.includes(t)),hashes=Object.fromEntries(tables.map(t=>[t,query(w,id,`SELECT count(*)||':'||md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM ${t} t`)]));return{worker:w,moduleId:id,hashes};});}
const report={startedAt:new Date().toISOString(),status:'in-progress',syntheticOnly:true,moduleDatabases:[],journals:[]};
try{
 const before=snapshot();execFileSync(process.execPath,['scripts/verify-phase14-contributions.mjs',directory],{stdio:'inherit',env:process.env,timeout:300000});assert.deepEqual(snapshot(),before,'Repeated contribution UI acceptance must preserve all original business/ledger/event rows');report.moduleDatabases=before;report.repeatPreservedOriginalRows=true;
 let settlements=0,receipts=0,held=0;
 for(const[w,id]of instances){const tables=before.find(v=>v.worker===w&&v.moduleId===id).hashes;if(tables.financial_journals){const rows=JSON.parse(query(w,id,"SELECT coalesce(jsonb_agg(payload),'[]'::jsonb) FROM financial_journals"));for(const payload of rows){const checked=validateJournal(payload);assert.equal(checked.externalIncomeCents,0);assert.equal(checked.internalTransferCreatesValue,false);report.journals.push({worker:w,moduleId:id,eventId:payload.eventId,kind:payload.kind,classification:payload.classification,...checked});}}
 if(id===coord)settlements+=Number(query(w,id,"SELECT count(*) FROM synthetic_settlements WHERE state='confirmed'"));
 if(id===budget)receipts+=Number(query(w,id,'SELECT count(*) FROM budget_receipts'));
 if(id===resource)held+=Number(query(w,id,"SELECT count(*) FROM resource_holds WHERE state='consumed'"));
 }assert.equal(settlements,3);assert.equal(receipts,3);assert.equal(held,3);report.exactOriginalSettlements=settlements;report.exactOriginalReceipts=receipts;report.exactConsumedReservations=held;
 for(const[w,expected]of[['worker-1',1300000],['worker-2',800000]]){const row=(await request(w,resource,'/availability-overview')).records.find(r=>r.programId===state.resources[w].programId);assert.equal(row.potentiallyAvailableCents,expected);report[w]={potentiallyAvailableCents:row.potentiallyAvailableCents};}
 report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;console.error(error.message);}finally{report.finishedAt=new Date().toISOString();await writeFile('artifacts/phase14-ledger-repeat.json',JSON.stringify(report,null,2)+'\n');console.log('Selected ledger and retry audit: '+report.status);}
