// These checks never start a model, browser, Docker command, login or deployment.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
for(const script of ['verify-phase15-installed-catalog-ollama.mjs','inspect-phase15-installed-catalog-analyst.mjs','verify-phase15-clean-installation.mjs','verify-phase15-live-catalog.mjs'])test(script+' refuses execution before operator readiness without Git, Docker or private installation files',()=>{const file=fileURLToPath(new URL(script,import.meta.url));assert.throws(()=>execFileSync(process.execPath,[file],{cwd:tmpdir(),env:{PATH:''},encoding:'utf8',stdio:['ignore','pipe','pipe']}),error=>error.status!==0&&/readiness required/i.test(error.stderr));});
test('source-free copied clean wrapper includes recovery dependency and refuses before operational access',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'steward-clean-recovery-'));
 try{
  await mkdir(path.join(directory,'scripts'));
  for(const file of ['verify-phase15-clean-installation.mjs','phase15-clean-recovery.mjs'])await writeFile(path.join(directory,'scripts',file),await readFile(new URL(file,import.meta.url)));
  assert.throws(()=>execFileSync(process.execPath,[path.join(directory,'scripts/verify-phase15-clean-installation.mjs')],{cwd:tmpdir(),env:{PATH:''},encoding:'utf8',stdio:['ignore','pipe','pipe']}),error=>error.status!==0&&/readiness required/i.test(error.stderr));
 }finally{
  assert.equal(path.dirname(directory),path.resolve(tmpdir()));assert(path.basename(directory).startsWith('steward-clean-recovery-'));await rm(directory,{recursive:true,force:true});
 }
});
