import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {phase13ModuleVersion,phase13ReleaseVersions} from './phase13-release-versions.mjs';
import {PHASE13_GATES,RELEASE13_IMAGE_KINDS,scienceVersionForRelease,scientificSourceVersion,assertBuildSource,validatePhase13Versions,assertPhase13Gates,assertImageBuildEvidence} from './release-contracts.mjs';
test('science versions and source identities reject historical retagging before any Docker build',async()=>{
 const source=await readFile('services/scientific/steward_science/analysis.py','utf8'),current=JSON.parse(await readFile('package.json','utf8')).version;assert.equal(scientificSourceVersion(source),scienceVersionForRelease(current));assert.equal(scienceVersionForRelease('0.13.0'),'1.1.0');assert.equal(scienceVersionForRelease('0.12.0'),'1.0.0');assert.equal(scienceVersionForRelease('0.14.0'),'1.2.0');assertBuildSource(current,current,source);
 assertBuildSource('0.13.0','0.13.0',"{'service':'steward-scientific','version':'1.1.0'}");assert.throws(()=>assertBuildSource('0.12.0','0.12.0',source),/immutable release tag/);assert.throws(()=>assertBuildSource('0.13.0',current,source),/matching preserved release source/);assert.equal(scienceVersionForRelease('0.15.0'),'1.2.0');assert.equal(scienceVersionForRelease('0.16.0'),'1.2.0');assert.throws(()=>scienceVersionForRelease('0.17.0'));
 assert.throws(()=>execFileSync(process.execPath,['scripts/build-release-images.mjs','0.12.0'],{stdio:'pipe'}),e=>e.status!==0&&String(e.stderr).includes('matching preserved release source'));

});
test('central versions retain independent module distribution and exact release-scoped scientific/simulator identities',async()=>{
 const value=validatePhase13Versions(JSON.parse(await readFile('docs/phase13-module-versions.json','utf8')));assert.equal(Object.keys(value.modules).length,15);assert.equal(value.modules['cee.inventory'],'1.5.0');assert.equal(value.modules['steward.housing.management'],'1.0.1');assert.equal(value.modules['cee.shopify'],'1.2.0');assert.equal(value.modules['cee.printify'],'1.1.2');assert.equal(value.commerceSimulatorTag,'steward-commerce-simulator:0.13.0');
 assert.throws(()=>validatePhase13Versions({...value,scientificVersion:'1.0.0'}));assert.throws(()=>validatePhase13Versions({...value,commerceSimulatorTag:'steward-commerce-simulator:1.0.1'}));
});
test('acceptance version selection follows the copied central release map from any working directory',()=>{
 for(const[id,version]of Object.entries(phase13ReleaseVersions.modules))assert.equal(phase13ModuleVersion(id),version);
 assert.throws(()=>phase13ModuleVersion('steward.not-selected'));assert.throws(()=>phase13ModuleVersion('constructor'));
 const moduleUrl=new URL('./phase13-release-versions.mjs',import.meta.url).href;
 const output=execFileSync(process.execPath,['--input-type=module','-e',`const {phase13ReleaseVersions}=await import(${JSON.stringify(moduleUrl)});process.stdout.write(JSON.stringify(phase13ReleaseVersions));`],{cwd:tmpdir(),encoding:'utf8',stdio:['ignore','pipe','pipe']});
 assert.deepEqual(JSON.parse(output),phase13ReleaseVersions);
});
test('Phase 13 acceptance runners do not retain fixed module/service version literals after a release selection changes',async()=>{
 const names=(await readdir(new URL('./',import.meta.url))).filter(name=>/^verify-phase13.*\.mjs$/.test(name));assert(names.includes('verify-phase13-participant-food.mjs'));
 for(const name of names){const source=await readFile(new URL(name,import.meta.url),'utf8');assert(!/(['"])[1-9]\d*\.\d+\.\d+\1/.test(source),name+' must use the central release version map instead of a stale package expectation');}
});
test('unverified or partially evidenced Phase 13 gates cannot promote; all mandatory IDs are checked',async()=>{
 const actual=JSON.parse(await readFile('docs/phase13-release-gates.json','utf8'));if(actual.status!=='passed')assert.throws(()=>assertPhase13Gates(actual),/remain open/);assert.throws(()=>assertPhase13Gates({...actual,status:'unverified'}),/remain open/);
 const fixture={version:'0.13.0',status:'passed',gates:PHASE13_GATES.map(id=>({id,mandatory:true,status:'passed',evidence:['fixture-only.json']}))};assertPhase13Gates(fixture);
 assert.throws(()=>assertPhase13Gates({...fixture,gates:fixture.gates.slice(0,-1)}));assert.throws(()=>assertPhase13Gates({...fixture,gates:fixture.gates.map((g,i)=>i?g:{...g,status:'unverified'})}));assert.throws(()=>assertPhase13Gates({...fixture,gates:fixture.gates.map((g,i)=>i?g:{...g,evidence:[]})}));
});
test('release image proof binds all eight image IDs and the exact clean build commit',()=>{
 const ids=Object.fromEntries(RELEASE13_IMAGE_KINDS.map((kind,n)=>[kind,'sha256:'+String(n).repeat(64)])),images=Object.fromEntries(Object.entries(ids).map(([kind,id])=>[kind,{id}])),proof={version:'0.13.0',sourceCommit:'a'.repeat(40),images:ids};assertImageBuildEvidence(proof,proof.sourceCommit,images);
 assert.throws(()=>assertImageBuildEvidence(proof,'b'.repeat(40),images));assert.throws(()=>assertImageBuildEvidence({...proof,images:{...ids,scientific:'sha256:'+'f'.repeat(64)}},proof.sourceCommit,images));const incomplete={...ids};delete incomplete['commerce-simulator'];assert.throws(()=>assertImageBuildEvidence({...proof,images:incomplete},proof.sourceCommit,images));
});
