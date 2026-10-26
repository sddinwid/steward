// Additive upgrade of already installed mission packages; never reinstall.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {canonical,digest} from '../packages/module-sdk/dist/index.js';
import {logins,directory,records,action,ensureInstalled,installed,ensurePeerWorkflow,waitFor,sql} from './phase13-acceptance-client.mjs';
const housing='steward.housing.management',support='steward.housing.services',assets='cee.assets';
const base=JSON.parse(await readFile(path.join(directory,'demo/phase13.json'),'utf8'));
const participantState=JSON.parse(await readFile(path.join(directory,'demo/phase13-participants.json'),'utf8'));
const report={verifiedAt:new Date().toISOString(),checks:[]};const pass=s=>{report.checks.push(s);console.log('PASS '+s);};
const hashes=rows=>Object.fromEntries(rows.map(r=>[r.id,digest(canonical(r))]));
try{
 await logins();assert(Number(sql('worker-1','SELECT max(version) FROM platform_migrations'))>=18,'Deploy the verified schema18 core first');
 const before={};for(const endpoint of ['/participants','/plans','/referrals'])before['support'+endpoint]=hashes(await records('worker-3',support,endpoint));
 for(const endpoint of ['/placements','/units','/buildings'])before['housing'+endpoint]=hashes(await records('worker-1',housing,endpoint));
 const oldFollowups=await records('worker-1',housing,'/followups');
 const historicalIds=participantState.cases.map(c=>c.invalidHistoricalFollowup?.id??c.housingFollowup?.id).filter(Boolean),legacyRows=oldFollowups.filter(r=>historicalIds.includes(r.id)&&r.milestoneDays===30);assert.equal(legacyRows.length,6,'This upgrade acceptance requires the six preserved premature observations from the prior deployed checkpoint');
 const placementsBefore=await records('worker-1',housing,'/placements');for(const r of legacyRows){const p=placementsBefore.find(p=>p.id===r.placementId);assert(p&&Date.parse(r.observedAt)<Date.parse(p.confirmedAt)+30*86400000,'Verify actual premature chronology rather than infer it from a record label');}
 const providerBefore=await installed('worker-2',assets);
 await ensureInstalled('worker-1',housing,'1.0.1',{syntheticOnly:true,integrationsEnabled:true});
 await ensureInstalled('worker-3',support,'1.0.1',{syntheticOnly:true,integrationsEnabled:true});
 for(const endpoint of ['/participants','/plans','/referrals'])assert.deepEqual(hashes(await records('worker-3',support,endpoint)),before['support'+endpoint]);
 for(const endpoint of ['/placements','/units','/buildings'])assert.deepEqual(hashes(await records('worker-1',housing,endpoint)),before['housing'+endpoint]);
 pass('Additive signed upgrades preserved all participant, plan, referral, placement, unit and building records and original provider receipts');
 const afterFollowups=await records('worker-1',housing,'/followups');
 for(const old of oldFollowups){const next=afterFollowups.find(r=>r.id===old.id);assert(next);if(legacyRows.some(r=>r.id===old.id)){assert.equal(next.verificationStatus,'legacy-invalid-historical-basis');for(const k of ['placementId','milestoneDays','observedAt','observation','recordedAt','recordedBy'])assert.equal(next[k],old[k]);}else assert.equal(digest(canonical(next)),digest(canonical(old)));}
 report.invalidHistoricalObservations=afterFollowups.filter(r=>r.code?.startsWith('P13-RETENTION-')&&r.verificationStatus==='legacy-invalid-historical-basis').length;
 pass('Historical synthetic milestone observations remain present with unchanged original observation fields and explicit invalid-basis status');
 for(const [worker,id,programId]of [['worker-1',housing,base.housingProgramId],['worker-3',support,participantState.programId]]){const programme=(await records(worker,id,'/programs')).find(p=>p.id===programId);assert(programme);const reviewed=await action(worker,id,'/review-programme-upgrade',programme);assert.equal(reviewed.reviewed,true);assert(reviewed.adoptedPermissions.every(p=>['program.finance','program.fund'].includes(p)));}
 pass('The current original programme owners explicitly reviewed only the signed financial permission additions');
 const authority=(await records('worker-2',assets,'/management-authorities')).find(r=>r.number==='P13-HOUSING-AUTHORITY');assert.equal(authority.status,'approved');
 await ensurePeerWorkflow({section:'mission-upgrade',key:'property-v2',source:'worker-1',destination:'worker-2',consumerId:housing,providerId:assets,sourceProgramId:base.housingProgramId,destinationProgramId:base.assetProgramId,capabilityId:'property.authority',operations:['catalog','verify'],purpose:'property.authority',maximumSensitivity:'business',disclosureBasis:'documented-authority',authorityReference:authority.id});
 let property=(await records('worker-1',housing,'/properties')).find(r=>r.id===base.propertyId);const oldPin=property.provider;assert(oldPin);
 await action('worker-1',housing,'/verify-property',property);
 property=await waitFor(async()=>{const r=(await records('worker-1',housing,'/properties')).find(r=>r.id===base.propertyId);return r.authorityStatus==='verified'&&Date.parse(r.authority.validUntil)>Date.now()+15000?r:null;},'fresh read from original pinned canonical property provider');
 for(const key of ['providerModuleId','providerInstallationId','packageDigest','destinationEntityId','destinationInstallationId','destinationProgramId','sourceProgramId'])assert.equal(property.provider[key],oldPin[key]);assert.equal((await installed('worker-2',assets)).operationId,providerBefore.operationId);
 pass('A newly reviewed read observation reached the original Assets provider; existing housing and referral obligations were not substituted');
 report.status='passed';
}catch(e){report.status='failed';report.error=e.message;throw e;}finally{await writeFile('artifacts/phase13-mission-module-upgrade.json',JSON.stringify(report,null,2)+'\n');}
