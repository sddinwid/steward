import type {Data} from '@steward/business-kit';
/** A reported effective start is not authoritative elapsed placement evidence. */
export function elapsedEmploymentObservation(observation:Data|undefined,pathway:Data,cutoff=Date.now()){
 if(!observation||observation.verificationStatus==='legacy-invalid-historical-basis'||![30,90].includes(observation.milestoneDays)||!['maintained','changed'].includes(observation.observation))return false;
 if(!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(pathway.id??'')||!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(pathway.programId??'')||!/^SYNREF-[A-F0-9]{32}$/.test(pathway.participantAlias??'')||observation.pathwayId!==pathway.id||observation.programId!==pathway.programId||observation.participantAlias!==pathway.participantAlias)return false;
 const placed=Date.parse(pathway.employedAt),observed=Date.parse(observation.observedAt),recorded=Date.parse(observation.recordedAt);
 return Number.isFinite(placed)&&Number.isFinite(observed)&&Number.isFinite(recorded)&&observed>=placed+observation.milestoneDays*86400000&&observed<=recorded&&recorded<=cutoff;
}
export function employmentRetentionVerified(observation:Data|undefined,pathway:Data,cutoff=Date.now()){
 return elapsedEmploymentObservation(observation,pathway,cutoff)&&observation!.observation==='maintained';
}
