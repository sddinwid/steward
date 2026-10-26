import type {DataEvent} from '@steward/contracts';
import {validateEconomicSummary,validateEconomicSummaryStatus} from '@steward/module-sdk';
import {fail,validUuid} from './security/crypto.js';
const closed=(v:any,keys:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
export function isEconomicEvent(e:DataEvent){return ['economic_summaries_v1','economic_summary_status_v1'].includes(e.streamId)||['economic-summary','economic-summary-status'].includes(e.disclosure?.kind??'');}
/** Validate the complete sensitive envelope before the existing inbox can retain it. */
export function validateEconomicEvent(e:DataEvent){const reject=()=>fail(400,'Invalid closed economic disclosure envelope'),source=e.source as any;
 if(!closed(e,['envelopeVersion','eventId','source','destinationInstallationId','sequence','occurredAt','eventType','payloadVersion','correlationId','moduleId','streamId','recordId','recordRevision','payload','disclosure'])||!['economic_summaries_v1','economic_summary_status_v1'].includes(e.streamId)||e.eventType!=='record.upsert'||e.recordRevision!==1||e.sequence!=='1'||e.correlationId!==undefined&&!validUuid(e.correlationId))reject();
 if(!closed(source,['installationId','entity','role','configVersion'])||source.role!=='worker'||source.configVersion!==undefined&&source.configVersion!==1||!closed(source.entity,['entityId','displayName'])||typeof source.entity.displayName!=='string'||!source.entity.displayName.trim()||source.entity.displayName.length>120)reject();
 if(!closed(e.disclosure,['contractVersion','kind','domain'])||e.disclosure?.contractVersion!==1||e.disclosure.kind!==(e.streamId==='economic_summary_status_v1'?'economic-summary-status':'economic-summary')||e.disclosure.domain!=='economic'||!closed(e.payload,['id','revision','projection'])||e.payload.id!==e.recordId||e.payload.revision!==1)reject();
 try{const p=(e.streamId==='economic_summary_status_v1'?validateEconomicSummaryStatus:validateEconomicSummary)(e.payload.projection,{entityId:source.entity.entityId,installationId:source.installationId,moduleId:e.moduleId});if(p.summaryId!==e.recordId)reject();}catch{reject();}
}
