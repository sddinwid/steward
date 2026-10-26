import type {DataEvent} from '@steward/contracts';
import {missionModuleDomains,validateMissionAggregateRelease,validateMissionResourceAllocation} from '@steward/mission-kit';
import {fail,validUuid} from './security/crypto.js';
import {MISSION_DISCLOSURE_STREAM,validateMissionDisclosureEvent} from './mission-disclosures.js';
const streams=['mission_aggregates_v1','mission_resources_v1'];
const closed=(v:any,keys:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
export function isMissionEvent(e:DataEvent){return streams.includes(e.streamId)||e.streamId===MISSION_DISCLOSURE_STREAM||e.disclosure!==undefined||Object.hasOwn(missionModuleDomains,e.moduleId);}
/** Strict before inbox persistence, including siblings and identity metadata. */
export function validateMissionEvent(e:DataEvent,now=new Date()){
 if(e.streamId===MISSION_DISCLOSURE_STREAM){validateMissionDisclosureEvent(e);return;}
 const reject=()=>fail(400,'Invalid private-service disclosure envelope');
 if(!closed(e,['envelopeVersion','eventId','source','destinationInstallationId','sequence','occurredAt','eventType','payloadVersion','correlationId','moduleId','streamId','recordId','recordRevision','payload','disclosure'])||!streams.includes(e.streamId)||e.eventType!=='record.upsert'||e.recordRevision!==1||e.sequence!=='1'||e.correlationId!==undefined&&!validUuid(e.correlationId))reject();
 const s=e.source as any;
 if(!closed(s,['installationId','entity','role','configVersion'])||s.role!=='worker'||s.configVersion!==undefined&&s.configVersion!==1||!closed(s.entity,['entityId','displayName'])||typeof s.entity.displayName!=='string'||!s.entity.displayName.trim()||s.entity.displayName.length>120)reject();
 const d=e.disclosure;
 if(!closed(d,['contractVersion','kind','domain'])||d?.contractVersion!==1||d.kind!=='program-aggregate'||!['housing','participant-services','employment','food'].includes(d.domain))reject();
 if(!closed(e.payload,['id','revision','projection'])||e.payload.id!==e.recordId||e.payload.revision!==1||!e.payload.projection)reject();
 const domain=(missionModuleDomains as Readonly<Record<string,string>>)[e.moduleId];if(domain&&domain!==d!.domain)reject();
 if(d?.kind!=='program-aggregate')reject();const source={entityId:s.entity.entityId,installationId:s.installationId,moduleId:e.moduleId,domain:d!.domain as 'housing'|'participant-services'|'employment'|'food'};
 try{
  if(e.streamId==='mission_aggregates_v1'){const p=validateMissionAggregateRelease(e.payload.projection,source,now);if(p.releaseId!==e.recordId)reject();}
  else {const p=validateMissionResourceAllocation(e.payload.projection,source);if(p.allocationId!==e.recordId)reject();}
 }catch{reject();}
}
