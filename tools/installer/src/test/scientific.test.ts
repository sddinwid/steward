import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {provision} from '../provision.js';
import {provisionSecurity} from '../security.js';
import {scientificVersionForPlatform} from '../scientific-version.js';
test('scientific service versions are explicit and historical tags are not inferred from new source',()=>{assert.equal(scientificVersionForPlatform('0.12.0'),'1.0.0');assert.equal(scientificVersionForPlatform('0.13.0'),'1.1.0');assert.equal(scientificVersionForPlatform('0.14.0'),'1.2.0');assert.throws(()=>scientificVersionForPlatform('0.15.0'));});
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
  assert.match(overlay,/image: steward-scientific:1\.1\.0/);assert.equal(JSON.parse(await readFile(path.join(directory,'scientific/manifest.json'),'utf8')).serviceVersion,'1.1.0');
  const compose=JSON.parse(execFileSync('docker',['compose','-f',path.join(directory,'compose.yaml'),'-f',path.join(directory,'security/compose.yaml'),'-f',path.join(directory,'scientific/compose.yaml'),'config','--format','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  assert.deepEqual(compose.services.scientific.tmpfs,['/tmp:rw,noexec,nosuid,size=32m']);assert.equal(compose.networks.scientific.internal,true);
  const key=await readFile(path.join(directory,'scientific/key.txt'),'utf8');await writeFile(path.join(directory,'scientific/compose.yaml'),overlay.replace('tmpfs: ["/tmp:rw,noexec,nosuid,size=32m"]','tmpfs: [/tmp:rw,noexec,nosuid,size=32m]'));
  execFileSync(process.execPath,[cli,directory],{stdio:'pipe'});assert.equal(await readFile(path.join(directory,'scientific/compose.yaml'),'utf8'),overlay);assert.equal(await readFile(path.join(directory,'scientific/key.txt'),'utf8'),key);
  // An existing 1.0 deployment retains all private files and its old configured
  // image; the release command, not repeat provisioning, pins an approved upgrade.
  const historical=JSON.parse(await readFile(path.join(directory,'scientific/manifest.json'),'utf8'));historical.serviceVersion='1.0.0';await writeFile(path.join(directory,'scientific/manifest.json'),JSON.stringify(historical));await writeFile(path.join(directory,'scientific/compose.yaml'),overlay.replace('steward-scientific:1.1.0','steward-scientific:1.0.0'));
  const retained=await Promise.all(files.map(f=>readFile(path.join(directory,'scientific',f),'utf8')));execFileSync(process.execPath,[cli,directory],{stdio:'pipe'});assert.deepEqual(await Promise.all(files.map(f=>readFile(path.join(directory,'scientific',f),'utf8'))),retained);
  const manifest=JSON.parse(await readFile(path.join(directory,'scientific/manifest.json'),'utf8'));manifest.installationId='wrong-installation';await writeFile(path.join(directory,'scientific/manifest.json'),JSON.stringify(manifest));
  assert.throws(()=>execFileSync(process.execPath,[cli,directory],{stdio:'pipe'}));assert.equal(await readFile(path.join(directory,'scientific/key.txt'),'utf8'),original[files.indexOf('key.txt')]);
 }finally{await rm(base,{recursive:true,force:true});}
});
