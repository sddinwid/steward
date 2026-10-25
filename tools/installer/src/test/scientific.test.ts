import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {provision} from '../provision.js';
import {provisionSecurity} from '../security.js';
test('optional scientific provisioning is isolated and repeatable without replacing private setup',async()=>{
 const base=await mkdtemp(path.join(tmpdir(),'steward-scientific-provision-')),directory=path.join(base,'deployment');
 try{
  await provision({directory,sourceRoot:process.cwd(),mode:'all',workers:3,project:'scientific-provision-test',label:'Fixture'});await provisionSecurity(directory,process.cwd());
  const before=await Promise.all(['manifest.json','compose.yaml','security/compose.yaml'].map(f=>readFile(path.join(directory,f),'utf8')));
  const cli=path.resolve('dist/scientific-cli.js');execFileSync(process.execPath,[cli,directory],{stdio:'pipe'});
  const files=await readdir(path.join(directory,'scientific')),original=await Promise.all(files.map(f=>readFile(path.join(directory,'scientific',f),'utf8')));
  execFileSync(process.execPath,[cli,directory],{stdio:'pipe'});
  assert.deepEqual(await Promise.all(files.map(f=>readFile(path.join(directory,'scientific',f),'utf8'))),original);
  assert.deepEqual(await Promise.all(['manifest.json','compose.yaml','security/compose.yaml'].map(f=>readFile(path.join(directory,f),'utf8'))),before);
  const overlay=await readFile(path.join(directory,'scientific/compose.yaml'),'utf8');assert.match(overlay,/internal: true/);assert.match(overlay,/mem_limit: 768m/);assert(!overlay.includes('worker-'));assert(!overlay.includes('ports:'));assert(!overlay.includes('docker.sock'));assert(!overlay.includes('depends_on:'));
  const manifest=JSON.parse(await readFile(path.join(directory,'scientific/manifest.json'),'utf8'));manifest.installationId='wrong-installation';await writeFile(path.join(directory,'scientific/manifest.json'),JSON.stringify(manifest));
  assert.throws(()=>execFileSync(process.execPath,[cli,directory],{stdio:'pipe'}));assert.equal(await readFile(path.join(directory,'scientific/key.txt'),'utf8'),original[files.indexOf('key.txt')]);
 }finally{await rm(base,{recursive:true,force:true});}
});
