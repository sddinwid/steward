import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {prepareModulePublication,verifyModuleSource} from './module-source-integrity.mjs';
test('carrier is independently packaged with unchanged migration bytes',async()=>{
 const source=await verifyModuleSource('modules/carrier-simulator');assert.equal(source.manifest.executionProtocol.version,1);assert.equal(source.migrations.length,1);
});
test('catalog capacity fails before image inspection and preserves every existing entry',async()=>{
 const dir=await mkdtemp(path.resolve('.steward/carrier-publication-'));
 try{await mkdir(path.join(dir,'modules/public'),{recursive:true});const file=path.join(dir,'modules/public/catalog.json');
 for(const count of [100,101]){const data=JSON.stringify({catalogVersion:1,packages:Array.from({length:count},(_,i)=>({payload:{manifest:{moduleId:'fixture.module'+i,version:'1.0.0'}}}))});await writeFile(file,data);
 await assert.rejects(()=>prepareModulePublication({source:'modules/carrier-simulator',directory:dir,inspectImage:()=>{throw Error('Unexpected Docker call');}}),/catalog limit|Invalid publication catalog/);assert.equal(await readFile(file,'utf8'),data);}
 }finally{await rm(dir,{recursive:true,force:true});}
});
