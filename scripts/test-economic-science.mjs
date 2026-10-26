// Actual isolated Python results independently reconciled in TypeScript; no operator mounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {validateEconomicAllocation,validateEconomicScenarios} from '../packages/platform/dist/economic-validation.js';
const image='steward-scientific:phase14-test';
const docker=(args,input)=>execFileSync('docker',args,{encoding:'utf8',input,maxBuffer:16*1024*1024});
if(!process.argv.includes('--skip-build'))execFileSync('docker',['build','-f','services/scientific/Dockerfile','--target','test','-t',image,'.'],{stdio:'inherit'});
const code=`import runpy,json,copy
from steward_science.economy import allocate,compare_economy
fixture=runpy.run_path('tests/test_economy.py')['fixture']
p=fixture();alternative=copy.deepcopy(p);alternative['priorities'].reverse()
infeasible=copy.deepcopy(p);infeasible['programs'][0]['minimumUnits']=[4]
unknown=copy.deepcopy(p);unknown['programs'][0]['unitCostCents']=[None]
scenarios={'baseline':p,'scenarios':[{'name':name,'generationBasisPoints':generation,'costBasisPoints':cost,'assumption':'Explicit synthetic scenario; no statistical probability asserted.'} for name,generation,cost in [('conservative',8000,12000),('baseline',10000,10000),('expansion',12000,10000)]]}
results=[{'name':name,'input':value,'result':allocate(value)} for name,value in [('reference',p),('food-priority',alternative),('infeasible',infeasible),('unknown',unknown)]]
resource=copy.deepcopy(p);resource['resources']=[{'resourceId':'00000000-0000-4000-8000-000000000013','ownerEntityId':p['sources'][0]['entityId'],'unit':'staff-hours','mode':'consumable','availableUnits':[2],'totalConsumableUnits':2,'unitsPerService':{p['programs'][0]['programId']:1},'valuationBasis':'unknown','assumption':'Explicit bounded synthetic time budget, no cash valuation.'}]
results.append({'name':'noncash','input':resource,'result':allocate(resource)})
periods=copy.deepcopy(resource);periods['horizon']='90-days';periods['periods']=[{'start':a,'end':b} for a,b in [('2026-11-01','2026-12-01'),('2026-12-01','2026-12-31'),('2026-12-31','2027-01-30')]]
periods['sources'][0].update(generationCents=[0,4000,4000],operatingCents=[1000]*3,protectedOperatingCents=[1000,0,0])
for programme in periods['programs']:
 for key in ['operatingCents','unitCostCents','maximumUnits','minimumUnits','budgetCents']:programme[key]*=3
periods['resources'][0].update(availableUnits=[3]*3,totalConsumableUnits=4)
results.append({'name':'90-days','input':periods,'result':allocate(periods)})
results.append({'name':'scenarios','input':scenarios,'result':compare_economy(scenarios)})
print(json.dumps(results))`;
const cases=JSON.parse(docker(['run','--rm','-i','--network','none','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=32m','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','768m','--cpus','2','--entrypoint','python',image,'-'],code));
let failures=0;
const check=async(name,run)=>test(name,()=>{try{run();}catch(error){failures++;throw error;}});
await check('actual Python reference, reversed priorities, infeasible and missing inputs reconcile independently',()=>{for(const c of cases){if(c.name==='scenarios')validateEconomicScenarios(c.input,c.result);else validateEconomicAllocation(c.input,c.result);}assert.equal(cases[0].result.proposedContributionCents,4000);assert.equal(cases[0].result.programEffects[0].additionalUnits,3);assert.equal(cases[1].result.programEffects[1].additionalUnits,10);});
await check('forged source, recipient, duplicate allocation, currency and cent values are rejected',()=>{const {input,result}=cases[0];for(const mutate of[r=>r.allocations[0].amountCents++,r=>r.allocations[0].sourceEntityId='unknown',r=>r.allocations[0].receiverEntityId='unknown',r=>r.allocations.push(r.allocations[0]),r=>r.currency='EUR',r=>r.newEcosystemIncomeFromAllocationsCents=4000,r=>r.allocations[0].amountCents=0.1]){const copy=structuredClone(result);mutate(copy);assert.throws(()=>validateEconomicAllocation(input,copy));}});
await check('fabricated service units, expenses, future balances and duplicate period rows fail exact checking',()=>{const {input,result}=cases[0];for(const mutate of[r=>r.programEffects[0].additionalUnits++,r=>r.programEffects[0].serviceCostCents++,r=>r.programEffects[0].remainingProgramCents++,r=>r.sourceEffects[0].protectedReserveCents--,r=>r.sourceEffects[0].remainingUnallocatedCents++,r=>r.programEffects[1]=r.programEffects[0]]){const copy=structuredClone(result);mutate(copy);assert.throws(()=>validateEconomicAllocation(input,copy));}});
await check('actual noncash and multi-period results reconcile, and altered resource use or assumed future cash fails',()=>{const noncash=cases.find(c=>c.name==='noncash'),periods=cases.find(c=>c.name==='90-days');assert.equal(noncash.result.resourceEffects[0].usedUnits,2);assert.equal(periods.result.status,'optimal');for(const mutate of[r=>r.resourceEffects[0].usedUnits++,r=>r.resourceEffects[0].remainingHorizonUnits++,r=>r.resourceEffects[0].ownerEntityId='unknown',r=>r.sourceEffects[1].assumedGenerationCents++]){const copy=structuredClone(periods.result);mutate(copy);assert.throws(()=>validateEconomicAllocation(periods.input,copy));}});
await check('altered scenario assumptions and fabricated partial success cannot pass reconciliation',()=>{const {input,result}=cases.at(-1);const copy=structuredClone(result);copy.scenarios[0].costBasisPoints++;assert.throws(()=>validateEconomicScenarios(input,copy));const forged=structuredClone(result);forged.status='partial';assert.throws(()=>validateEconomicScenarios(input,forged));const unknown=structuredClone(cases[3].result);unknown.allocations=[cases[0].result.allocations[0]];assert.throws(()=>validateEconomicAllocation(cases[3].input,unknown));});
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/phase14-economic-scientific-evidence.json',JSON.stringify({synthetic:true,operatorDataAccess:false,failures,cases},null,2)+'\n');
if(failures)process.exitCode=1;
