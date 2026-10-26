import type {Data} from '@steward/business-kit';
/** A source-owned fixed-cutoff observation; never derive a public complement. */
export function unresolvedAuthorizedReferralParticipants(referrals:Data[],periodEnd:string):number|null{
 const cutoff=Date.parse(periodEnd);if(!Number.isFinite(cutoff))return null;const subjects=new Set<string>();
 for(const r of referrals){if(!r.reviewedAt||Date.parse(r.reviewedAt)>=cutoff)continue;if(!Number.isFinite(Date.parse(r.reviewedAt))||typeof r.participantRef!=='string')return null;
  // A receipt newer than the requested cutoff cannot establish its older state.
  if(r.acknowledgedAt&&(!Number.isFinite(Date.parse(r.acknowledgedAt))||Date.parse(r.acknowledgedAt)>=cutoff))return null;
  const p=r.providerStatus;let settled=false;
  if(r.status==='withdrawn'||r.status==='closed'){const disposition=r.status==='withdrawn'?r.withdrawnAt:r.closedAt,receiptDisposition=p?.status===r.status?r.acknowledgedAt:undefined,at=Date.parse(disposition??receiptDisposition);if(!Number.isFinite(at)||at>=cutoff)return null;settled=true;}
  if(r.type==='housing'&&p?.confirmed===true||r.type==='food'&&p?.status==='delivered'||r.type==='training'&&p?.trainingCompleted===true||r.type==='employment'&&p?.employed===true){if(!r.acknowledgedAt)return null;settled=true;}
  if(!settled)subjects.add(r.participantRef);
 }
 return subjects.size;
}
