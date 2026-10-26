import {validateEconomicSummary,validateEconomicSummaryStatus,type ModulePackageManifest} from '@steward/module-sdk';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const closed = (value: unknown, keys: string[]): value is Record<string, any> => object(value) && Object.keys(value).every(key => keys.includes(key));
const envelopeKeys = ['envelopeVersion','eventId','source','destinationInstallationId','sequence','occurredAt','eventType','payloadVersion','moduleId','streamId','recordId','recordRevision','payload','disclosure','correlationId'];
const sourceKeys = ['configVersion','installationId','role','entity'];
function publicSource(value: unknown, installationId: string): value is Record<string, any> {
    return closed(value, sourceKeys) && value!.installationId === installationId && uuid.test(installationId) && value!.role === 'worker' &&
        (value!.configVersion === undefined || value!.configVersion === 1) && closed(value!.entity, ['entityId','displayName']) &&
        typeof value!.entity.entityId === 'string' && uuid.test(value!.entity.entityId) && typeof value!.entity.displayName === 'string' && value!.entity.displayName.length > 0 && value!.entity.displayName.length <= 200;
}

/** Validate an entire database outbox batch against its verified package before
 * the Worker signs anything. Nested projection schemas remain owned by declared
 * contracts and are validated again by the Worker before it signs the batch. */
export function boundReplicationEvents(manifest: ModulePackageManifest, events: unknown[], installationId: string, trustedSourceIdentity?: unknown): unknown[] {
    const deny = (): never => { throw Object.assign(new Error('MODULE_REPLICATION_BINDING_MISMATCH'), { code: 'MODULE_REPLICATION_BINDING_MISMATCH' }); };
    if (!Array.isArray(events) || events.length > 10) deny();
    // Sensitive package declarations cannot fall back to an untrusted module
    // configuration or its self-asserted event identity, even for an empty batch.
    const trusted = manifest.programServices||manifest.economicServices ? trustedSourceIdentity : undefined;
    if ((manifest.programServices||manifest.economicServices) && !publicSource(trusted, installationId)) deny();
    for (const value of events) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) deny();
        const event = value as Record<string, any>;
        const stream = manifest.replication?.streams.find(s => s.streamId === event.streamId);
        if (event.moduleId !== manifest.moduleId || !stream || event.eventType !== 'record.upsert' || event.source?.installationId !== installationId) deny();
        const payload = event.payload;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => !stream!.columns.includes(key)) ||
            String(payload[stream!.idColumn]) !== event.recordId || !Number.isSafeInteger(event.recordRevision) || event.recordRevision < 1 || Number(payload[stream!.revisionColumn]) !== event.recordRevision) deny();
        if (manifest.programServices||manifest.economicServices) {
            const identity = trusted as Record<string, any>;
            if (!closed(event, envelopeKeys) || event.envelopeVersion !== 1 || event.payloadVersion !== 1 ||
                !uuid.test(event.eventId) || !uuid.test(event.recordId) || !uuid.test(event.destinationInstallationId) || event.sequence !== String(event.recordRevision) ||
                typeof event.occurredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(event.occurredAt) || !Number.isFinite(Date.parse(event.occurredAt)) ||
                event.correlationId !== undefined && (typeof event.correlationId !== 'string' || !uuid.test(event.correlationId)) ||
                !(manifest.economicServices?['economic_summaries_v1','economic_summary_status_v1']:['mission_aggregates_v1','mission_resources_v1']).includes(event.streamId) ||
                !closed(event.disclosure, ['contractVersion','kind','domain']) || event.disclosure.contractVersion !== 1 || event.disclosure.kind !== (manifest.economicServices?(event.streamId==='economic_summary_status_v1'?'economic-summary-status':'economic-summary'):'program-aggregate') || event.disclosure.domain !== (manifest.economicServices?'economic':manifest.programServices!.domain) ||
                !publicSource(event.source, installationId) || event.source.entity.entityId !== identity.entity.entityId || event.source.entity.displayName !== identity.entity.displayName ||
                !closed(payload, ['id','revision','projection'])) deny();
            if(manifest.economicServices){try{const status=event.streamId==='economic_summary_status_v1',p=(status?validateEconomicSummaryStatus:validateEconomicSummary)(payload.projection,{entityId:identity.entity.entityId,installationId,moduleId:manifest.moduleId});if(p.summaryId!==event.recordId||event.recordRevision!==1||!status&&p.metrics.type!==manifest.economicServices.kind)deny();}catch{deny();}}
        }
    }
    return events;
}
