// Commit only sanitized results, never private deployment snapshots or credentials.
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {directory,compose,docker,manifest} from './lib.mjs';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const unitLog=await readFile('artifacts/phase6-unit-tests.log','utf8'),buildLog=await readFile('artifacts/phase6-build.log','utf8');
const unitPasses=[...unitLog.matchAll(/^ℹ pass (\d+)/gm)].reduce((n,m)=>n+Number(m[1]),0);assert.equal(unitPasses,34);assert.equal([...unitLog.matchAll(/^ℹ fail (\d+)/gm)].reduce((n,m)=>n+Number(m[1]),0),0);
for(const name of ['module-sdk','module-host','contracts','platform','ui','master-api','worker-api','master-web','worker-web','installer'])assert.ok(buildLog.includes('> @steward/'+name+'@'));
const demo=path.resolve(process.env.STEWARD_DEMO_DEPLOYMENT??'.steward/phase6-acceptance');
const bundle=path.resolve(process.env.STEWARD_RELEASE_BUNDLE??'artifacts/releases/steward-0.6.0');
const live=await read(path.join(demo,'demo/live-ai.json')),acceptance=await read('artifacts/phase6-acceptance.json'),regressions=await read('artifacts/phase6-regressions.json');
assert.equal(acceptance.status,'passed');assert.equal(regressions.status,'passed');assert.equal(regressions.checks.length,18);
assert.equal(live.testModel,false);assert.equal(live.investigationStatus,'completed');assert.equal(live.configurationRestored,true);assert.equal(live.modelUnloaded,true);
const independent=[];
for(const a of live.result.analyses){
 const observed=a.observed,c=a.calculation,s=c.assumptions;
 const shared=s.locationCompatible?Math.min(Number(observed.supply.available_m3),Number(observed.demand.required_m3)):0;
 const avoided=Number(observed.demand.monthly_external_cost)*shared/Number(observed.demand.required_m3)*s.avoidableExternalFraction;
 assert.equal(c.sharedCapacity,shared);assert.equal(c.avoidedExternalMonthlyCost,avoided);
 const consumer=avoided-s.internalMonthlyPayment,provider=s.internalMonthlyPayment-s.incrementalMonthlyCost,ecosystem=avoided-s.incrementalMonthlyCost;
 assert.equal(c.proposal.consumerMonthlyBenefit,consumer);assert.equal(c.proposal.providerMonthlyBenefit,provider);assert.equal(c.proposal.ecosystemMonthlyBenefit,ecosystem);assert.equal(consumer+provider,ecosystem);assert.equal(c.proposal.ecosystemHorizonBenefit,ecosystem*s.horizonMonths-s.transitionExpense);
 for(const [i,v]of s.sensitivity.entries()){const alt=c.alternatives[i];assert.equal(alt.ecosystemMonthlyBenefit,avoided-v.incrementalMonthlyCost);assert.equal(alt.ecosystemHorizonBenefit,(avoided-v.incrementalMonthlyCost)*s.horizonMonths-v.transitionExpense);}
 for(const value of [consumer,provider,ecosystem,c.proposal.ecosystemHorizonBenefit,c.alternatives[0].ecosystemHorizonBenefit])assert.ok(live.result.narrative.replaceAll(',','').includes(String(value)),'Narrative must quote the actual service figures');
 assert.match(live.result.narrative,/conditional location compatibility/i);
 independent.push({sharedCapacityM3:shared,avoidedExternalMonthlyCost:avoided,consumerMonthlyBenefit:consumer,providerMonthlyBenefit:provider,ecosystemMonthlyBenefit:ecosystem,horizonBenefit:ecosystem*s.horizonMonths-s.transitionExpense,review:'Numeric narrative supported by retrieved synthetic observations and explicitly illustrative assumptions; generic model word units is rendered as m³ in authoritative source/calculation cards. Zero-change benefit is comparative, not absence of warehouse utility. Human feasibility and business approval remain required.'});
}
const ps=await(await fetch('http://127.0.0.1:11434/api/ps')).json();assert.equal(ps.models.length,0);
const tags=await(await fetch('http://127.0.0.1:11434/api/tags')).json();assert.equal(tags.models.find(m=>m.name==='qwen2.5:7b').digest,'845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e');
const rawRuntime=compose('ps','--format','json').trim(),runtime=rawRuntime.startsWith('[')?JSON.parse(rawRuntime):rawRuntime.split('\n').map(r=>JSON.parse(r));assert.equal(runtime.length,15);assert.ok(runtime.every(r=>r.Health==='healthy'));
const deployment=await manifest(),workerImages=Object.fromEntries(deployment.instances.filter(i=>i.role==='worker').map(i=>[i.key,JSON.parse(docker(['inspect',compose('ps','-q',i.key+'-api')]))[0].Image]));assert.equal(new Set(Object.values(workerImages)).size,1);
const provider=await read(path.join(directory,'analyst/config/model.json'));assert.deepEqual(provider,{});
assert.equal((await readFile(path.join(directory,'analyst/config/api-key.txt'),'utf8')).trim(),'');
const release=await read(path.join(bundle,'release.json')),hash=createHash('sha256');for await(const b of createReadStream(path.join(bundle,'images.tar')))hash.update(b);
assert.equal(hash.digest('hex'),release.files['images.tar']);
const evidence={recordedAt:new Date().toISOString(),phase5bBaselineCommit:'9aa2a94',release:{version:release.version,platformCompatibility:release.platformCompatibility,sourceBaseCommit:release.sourceCommit,includesWorkingTreeChanges:release.includesWorkingTreeChanges,manifestSha256:createHash('sha256').update(await readFile(path.join(bundle,'release.json'))).digest('hex'),imageArchiveSha256:release.files['images.tar'],imageArchiveBytes:(await stat(path.join(bundle,'images.tar'))).size,images:release.images},acceptance,portability:await read('artifacts/phase6-portability.json'),providerRecovery:await read('artifacts/phase6-provider-recovery.json'),liveAI:{...live,status:'accepted_after_evidence_and_narrative_review',originalWireStatus:live.status,independentCalculationAndNarrativeReview:independent},acknowledgments:await read(path.join(demo,'demo/acknowledgments.json')),browser:await read('artifacts/phase6-ai-browser.json'),regressions,finalRuntime:{healthyCoreServices:runtime.length,workerImages,providerConfigurationRestored:true,modelWeightsUnchanged:true,loadedModels:0},limitations:['MVP local Docker Desktop Linux/amd64 validation, not commercial production certification','Checksummed local artifacts require independently trusted provenance; no release signing service or remote registry','Same-application-image 0.5.0-to-0.6.0 packaging redeployment; future schema-changing upgrades not validated','Toolkit dependency installation requires npm registry/cache; not a fully air-gapped installer','Generated local TLS CA and privileged Docker module-host boundary require production operational controls','Cloud providers, remote-host deployment, key/certificate rotation, HA/load and backup restoration not validated','Human feasibility/business approval required; no model-executed business decision','Historical findings, events and audit remain during scoped synthetic reset; initial module absence requires a new project']};
evidence.buildAndUnitTests={workspacesBuilt:10,passed:unitPasses,failed:0,skipped:0};
evidence.existingSeededDeploymentUpgrade=await read('artifacts/phase6-existing-upgrade.json');assert.equal(evidence.existingSeededDeploymentUpgrade.status,'passed');
const serialized=JSON.stringify(evidence,null,2)+'\n';
await writeFile('docs/phase6-verification-evidence.json',serialized);
await writeFile(path.join(path.dirname(bundle),'steward-'+release.version+'-verification.json'),serialized);
console.log('PASS sanitized Phase 6 release, real MCP/model calls, independent equations, browser/delivery/recovery and full regression evidence recorded.');
