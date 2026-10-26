import type {Data} from '@steward/business-kit';
/** False is not verified, never a finding that a person is unstable/ineligible. */
export function elapsedHousingObservation(followup:Data|undefined,placement:Data,cutoff=Date.now()){
 if(!followup||followup.verificationStatus==='legacy-invalid-historical-basis'||![30,90].includes(followup.milestoneDays)||!['maintained','changed'].includes(followup.observation))return false;
 if(!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(placement.id??'')||!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(placement.programId??'')||!/^SYNREF-[A-F0-9]{32}$/.test(placement.participantAlias??'')||followup.placementId!==placement.id||followup.programId!==placement.programId||followup.participantAlias!==placement.participantAlias)return false;
 const confirmed=Date.parse(placement.confirmedAt),observed=Date.parse(followup.observedAt),recorded=Date.parse(followup.recordedAt);
 return Number.isFinite(confirmed)&&Number.isFinite(observed)&&Number.isFinite(recorded)&&observed>=confirmed+followup.milestoneDays*86400000&&observed<=recorded&&recorded<=cutoff;
}
export function housingRetentionVerified(followup:Data|undefined,placement:Data,cutoff=Date.now()){
 return elapsedHousingObservation(followup,placement,cutoff)&&followup!.observation==='maintained'&&(!placement.departedAt||Date.parse(placement.departedAt)>cutoff);
}
