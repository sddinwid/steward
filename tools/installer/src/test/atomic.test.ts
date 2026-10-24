import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {publishDirectory} from '../atomic.js';

test('transient filesystem contention publishes the same prepared private identity without regeneration',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'steward-publication-')),source=path.join(root,'staging'),target=path.join(root,'security'),secret=randomBytes(48);
 try{await mkdir(source);await writeFile(path.join(source,'identity'),secret);let calls=0;await publishDirectory(source,target,async(from,to)=>{if(calls++===0)throw Object.assign(new Error('Controlled busy directory'),{code:'EPERM'});await rename(from,to);});assert.deepEqual(await readFile(path.join(target,'identity')),secret);assert.equal(calls,2);}
 finally{assert.equal(path.dirname(root),tmpdir());await rm(root,{recursive:true,force:true});}
});
test('publication refuses to replace an existing installation and retains both sets of private bytes',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'steward-publication-')),source=path.join(root,'staging'),target=path.join(root,'security'),existing=randomBytes(48),prepared=randomBytes(48);
 try{await mkdir(source);await mkdir(target);await writeFile(path.join(source,'identity'),prepared);await writeFile(path.join(target,'identity'),existing);await assert.rejects(publishDirectory(source,target),{code:'EEXIST'});assert.deepEqual(await readFile(path.join(target,'identity')),existing);assert.deepEqual(await readFile(path.join(source,'identity')),prepared);}
 finally{assert.equal(path.dirname(root),tmpdir());await rm(root,{recursive:true,force:true});}
});
