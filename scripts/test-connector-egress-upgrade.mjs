import assert from 'node:assert/strict';
import {planUpgradeGrant,parseEgressArguments,assertEgressHostVersions} from './connector-egress-upgrade-policy.mjs';
const id='cee.shopify',migration={version:1,sha256:'a'.repeat(64)};
const installed={imageId:'sha256:old',manifest:{moduleId:id,version:'1.2.0',persistence:{migrations:[migration]}}};
const candidate={imageId:'sha256:new',manifest:{moduleId:id,version:'1.3.0',connector:{provider:'shopify'},persistence:{migrations:[migration,{version:2,sha256:'b'.repeat(64)}]}}};
const host={installationId:'worker-original',project:'original-project',workerKey:'worker-3',connectorSecretsRoot:'/original/private',unchanged:{other:true},connectorEgress:{[id]:{network:'original-network',imageId:installed.imageId},'cee.printify':{network:'other',imageId:'other'}}};
const input={id,packageId:id+'@1.3.0',expectedImage:candidate.imageId,installed,candidate,host,expectedNetwork:'original-network',applied:[migration],runtime:{installationId:host.installationId,moduleId:id,version:'1.2.0',configuration:{mode:'live'},persistence:{migrations:[migration]}},actual:{Image:installed.imageId,Config:{Labels:{'steward.managed-by':'module-host-v1','steward.installation':host.installationId,'steward.module':id}}},network:{Name:'original-network',Internal:false,Driver:'bridge',Labels:{'steward.egress.installation':host.installationId,'steward.egress.module':id}}};
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS '+name);};
test('host protocol 0.8.1 and platform image 0.15 satisfy platform 0.15 candidate',()=>assertEgressHostVersions({hostProtocolVersion:'0.8.1',platformRelease:'0.15.0',candidateMinimum:'0.15.0'}));
test('older running platform image fails despite supported host protocol',()=>assert.throws(()=>assertEgressHostVersions({hostProtocolVersion:'0.8.1',platformRelease:'0.14.0',candidateMinimum:'0.15.0'})));
test('missing platform image proof and unsupported host protocol fail closed',()=>{assert.throws(()=>assertEgressHostVersions({hostProtocolVersion:'0.8.1',candidateMinimum:'0.15.0'}));assert.throws(()=>assertEgressHostVersions({hostProtocolVersion:'0.8.0',platformRelease:'0.15.0',candidateMinimum:'0.15.0'}));});
test('legacy network grant arguments remain accepted',()=>assert.deepEqual(parseEgressArguments(['--directory','selected','--worker','worker-3','--module',id,'--subnet','10.1.2.0/28']),{upgrade:false,options:{directory:'selected',worker:'worker-3',module:id,subnet:'10.1.2.0/28'}}));
test('legacy revoke remains accepted',()=>assert.equal(parseEgressArguments(['--directory','selected','--worker','worker-3','--revoke']).options.revoke,true));
test('upgrade requires paired exact package and image without network mutations',()=>{for(const args of [['--upgrade-package','cee.shopify@1.3.0'],['--expected-image','sha256:new'],['--upgrade-package','cee.shopify@1.3.0','--expected-image','sha256:new','--subnet','10.1.2.0/28'],['--upgrade-package','cee.shopify@1.3.0','--expected-image','sha256:new','--revoke']])assert.throws(()=>parseEgressArguments(args));assert.equal(parseEgressArguments(['--upgrade-package','cee.shopify@1.3.0','--expected-image','sha256:new']).upgrade,true);});
test('only reviewed grant image changes; input and other grants remain unchanged',()=>{const original=structuredClone(input),out=planUpgradeGrant(input);assert.equal(out.connectorEgress[id].imageId,candidate.imageId);assert.equal(out.connectorEgress[id].network,'original-network');assert.deepEqual(input,original);delete out.connectorEgress[id];const expected=structuredClone(host);delete expected.connectorEgress[id];assert.deepEqual(out,expected);});
for(const [name,change] of [
 ['wrong expected image',x=>x.expectedImage='stale'],
 ['wrong exact package',x=>x.packageId=id+'@1.4.0'],
 ['same version rebuild',x=>x.candidate.manifest.version='1.2.0'],
 ['downgrade',x=>{x.candidate.manifest.version='1.1.0';x.packageId=id+'@1.1.0';}],
 ['rewritten migration',x=>x.candidate.manifest.persistence.migrations[0].sha256='bad'],
 ['changed applied row',x=>x.applied[0].sha256='bad'],
 ['extra applied migration',x=>x.applied.push({version:2,sha256:'extra'})],
 ['stale running image',x=>x.actual.Image='changed'],
 ['stale grant image',x=>x.host.connectorEgress[id].imageId='changed'],
 ['unknown grant metadata is never dropped',x=>x.host.connectorEgress[id].futureApproval='preserve'],
 ['changed runtime version',x=>x.runtime.version='changed'],
 ['changed runtime worker',x=>x.runtime.installationId='foreign'],
 ['changed runtime mode',x=>x.runtime.configuration.mode='simulator'],
 ['missing existing network',x=>x.network=null],
 ['different approved network',x=>x.host.connectorEgress[id].network='replacement'],
 ['wrong network ownership',x=>x.network.Labels['steward.egress.installation']='foreign'],
 ['wrong network module',x=>x.network.Labels['steward.egress.module']='foreign'],
 ['internal network',x=>x.network.Internal=true],
 ['foreign endpoint',x=>x.network.Containers={foreign:{}}]
])test(name,()=>{const x=structuredClone(input);for(const key of ['installed','candidate','applied','runtime'])x[key]=structuredClone(x[key]);change(x);assert.throws(()=>planUpgradeGrant(x));});
console.log(JSON.stringify({passed:count,mutations:false}));
