import type {DataEvent} from '@steward/contracts';
import {isIntelligenceStream,validateIntelligenceProjection} from '@steward/catalog-kit/intelligence';
import {fail} from './security/crypto.js';
const closed=(v:any,keys:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
/** Closed publications are separately scoped; operational tables stay private. */
export function validateIntelligenceEvent(e:DataEvent){
 const reject=()=>fail(400,'Invalid closed Catalog intelligence publication');
 if(!isIntelligenceStream(e.streamId)||e.eventType!=='record.upsert'||e.disclosure!==undefined||!closed(e,['envelopeVersion','eventId','source','destinationInstallationId','sequence','occurredAt','eventType','payloadVersion','correlationId','moduleId','streamId','recordId','recordRevision','payload'])||!closed(e.source,['installationId','entity','role','configVersion'])||e.source.role!=='worker'||!closed(e.source.entity,['entityId','displayName'])||!closed(e.payload,['id','revision','projection'])||e.payload.id!==e.recordId||e.payload.revision!==e.recordRevision)reject();
 try{validateIntelligenceProjection(e.payload.projection,{entityId:e.source.entity.entityId,installationId:e.source.installationId,moduleId:e.moduleId,streamId:e.streamId});if(e.payload.projection.id!==e.recordId||e.payload.projection.revision!==e.recordRevision)reject();}catch{reject();}
}
