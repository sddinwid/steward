import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {PHASE13_GATES,RELEASE13_IMAGE_KINDS,scienceVersionForRelease,scientificSourceVersion,assertBuildSource,validatePhase13Versions,assertPhase13Gates,assertImageBuildEvidence} from './release-contracts.mjs';
test('science versions and source identities reject historical retagging before any Docker build',async()=>{
 const source=await readFile('services/scientific/steward_science/analysis.py','utf8');assert.equal(scientificSourceVersion(source),'1.1.0');assert.equal(scienceVersionForRelease('0.13.0'),'1.1.0');assert.equal(scienceVersionForRelease('0.12.0'),'1.0.0');assertBuildSource('0.13.0','0.13.0',source);
 assert.throws(()=>assertBuildSource('0.12.0','0.12.0',source),/immutable release tag/);assert.throws(()=>assertBuildSource('0.12.0','0.13.0',source),/matching preserved release source/);assert.throws(()=>scienceVersionForRelease('0.14.0'));
 assert.throws(()=>execFileSync(process.execPath,['scripts/build-release-images.mjs','0.12.0'],{stdio:'pipe'}),e=>e.status!==0&&String(e.stderr).includes('matching preserved release source'));
});
test('central versions retain independent module distribution and exact release-scoped scientific/simulator identities',async()=>{
 const value=validatePhase13Versions(JSON.parse(await readFile('docs/phase13-module-versions.json','utf8')));assert.equal(Object.keys(value.modules).length,15);assert.equal(value.modules['cee.inventory'],'1.5.0');assert.equal(value.modules['steward.housing.management'],'1.0.1');assert.equal(value.modules['cee.shopify'],'1.2.0');assert.equal(value.modules['cee.printify'],'1.1.2');assert.equal(value.commerceSimulatorTag,'steward-commerce-simulator:0.13.0');
 assert.throws(()=>validatePhase13Versions({...value,scientificVersion:'1.0.0'}));assert.throws(()=>validatePhase13Versions({...value,commerceSimulatorTag:'steward-commerce-simulator:1.0.1'}));
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
