import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { api,logins } from './phase4-client.mjs';
import { directory } from './lib.mjs';
const runSeed=()=>execFileSync(process.execPath,['scripts/seed-phase4.mjs',directory],{stdio:'pipe'});
runSeed();await logins();
const state=JSON.parse(await readFile(path.join(directory,'data/scenario-state.json'),'utf8'));
const paths={'worker-1':'capacities','worker-2':'storage','worker-3':'assets'};
async function counts(){return Object.fromEntries(await Promise.all(Object.entries(paths).map(async([w,p])=>[w,(await api(w,'/api/v3/modules/cee.operations/api/'+p)).value.records.length])));}
const before=await counts();const base='/api/v3/modules/cee.operations/api/capacities';
const original=(await api('worker-1',base)).value.records.find(r=>r.id===state.records['worker-1/manufacturing-1']);assert.ok(original);
const body={...original,name:original.name+' (seed preservation check)'};delete body.id;delete body.available_m3;
await api('worker-1',base+'/'+original.id,'PUT',body);
try{
 runSeed();assert.deepEqual(await counts(),before);
 const current=(await api('worker-1',base)).value.records.find(r=>r.id===original.id);assert.equal(current.name,body.name);
 await writeFile('artifacts/phase4-seed-verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),assertions:'all passed',counts:before,stableIds:true,preservedEdits:true},null,2));
 console.log('PASS repeated synthetic seeding creates no duplicate records and preserves edits using stable installation-bound record IDs');
}finally{
 const current=(await api('worker-1',base)).value.records.find(r=>r.id===original.id);const restore={...current,name:original.name};delete restore.id;delete restore.available_m3;await api('worker-1',base+'/'+original.id,'PUT',restore);
}
