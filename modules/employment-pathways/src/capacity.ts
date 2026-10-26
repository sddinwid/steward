import {missionCapacityVector} from '@steward/mission-kit';
import type {Data} from '@steward/business-kit';
/** Missing, failed or stale authority is unknown. These are service units,
 * never participant outcomes or a count copied from the shared catalogue. */
export function programmeCapacity(program:Data,cutoff=Date.now(),now=Date.now(),publication=false){
 const values:Data={};if(!Number.isFinite(cutoff)||!Number.isFinite(now))return missionCapacityVector();for(const prefix of ['training','employment']){const e=program[prefix+'CapacityEvidence'],d=e?.data,p=e?.provider;
  if(program[prefix+'CapacityState']!=='ready'||!d||!p||d.sourceProgramId!==program.id||d.programId!==program[prefix+'AuthorityProgramId']||p.sourceProgramId!==program.id||p.destinationProgramId!==program[prefix+'AuthorityProgramId']||p.destinationEntityId!==program[prefix+'AuthorityEntityId']||p.destinationInstallationId!==program[prefix+'AuthorityInstallationId']||p.providerModuleId!==program[prefix+'AuthorityModuleId']||!Number.isFinite(Date.parse(d.observedAt))||!Number.isFinite(Date.parse(d.validUntil))||cutoff>now||Date.parse(d.observedAt)>cutoff||cutoff-Date.parse(d.observedAt)>300000||now-Date.parse(d.observedAt)>300000||Date.parse(d.validUntil)<=cutoff||Date.parse(d.validUntil)<=now)continue;
  if(prefix==='training'){if(![d.trainingSeats,d.availableTrainingSeats].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=100000)||d.availableTrainingSeats>d.trainingSeats)continue;values.trainingSeats=d.trainingSeats;values.availableTrainingSeats=publication&&d.availableTrainingSeats<d.trainingSeats?null:d.availableTrainingSeats;}else if([d.employmentOpportunities,d.approvedEmploymentSlots].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=100000)&&d.employmentOpportunities<=d.approvedEmploymentSlots)values.employmentOpportunities=publication&&d.employmentOpportunities<d.approvedEmploymentSlots?null:d.employmentOpportunities;
 }return missionCapacityVector(values);
}
