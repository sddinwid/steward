// Pure process guards only: no Docker, browser, login, model, or selected-deployment access.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('./finalize-phase15-catalog-review.mjs',import.meta.url));
function refused(args,pattern){assert.throws(()=>execFileSync(process.execPath,[script,...args],{cwd:tmpdir(),env:{PATH:''},encoding:'utf8',stdio:['ignore','pipe','pipe']}),e=>e.status!==0&&pattern.test(e.stderr));}
test('human finalizer refuses before any selected-deployment access without explicit readiness',()=>refused([],/Explicit operator readiness and actual human narrative review required/));
test('human finalizer requires exact reviewed narrative hash before reading any report',()=>refused(['--execute-authorized','--report','missing-report.json'],/Supply exact reviewed narrative digest/));
test('human finalizer rejects automatic prior PASS and already-published deferred reports before importing platform/client',async()=>{const folder=await mkdtemp(path.join(tmpdir(),'steward-finalizer-'));try{const file=path.join(folder,'source.json'),args=['--execute-authorized','--report',file,'--reviewed-narrative-sha256','a'.repeat(64)];await writeFile(file,JSON.stringify({status:'passed'}));refused(args,/awaiting-review/);await writeFile(file,JSON.stringify({status:'awaiting-review',findingDeferred:true,findingId:'already-published',deliveries:[]}));refused(args,/Deferred report cannot already contain/);}finally{assert.equal(path.dirname(folder),path.resolve(tmpdir()));assert(path.basename(folder).startsWith('steward-finalizer-'));await rm(folder,{recursive:true,force:true});}});
