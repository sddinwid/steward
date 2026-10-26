import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {ModulePackageManifest} from '@steward/module-sdk';
import {boundReplicationEvents} from './replication.js';

const installationId=randomUUID(),recordId=randomUUID();
const manifest={moduleId:'test.owner',replication:{contractVersion:1,streams:[{streamId:'approved_summary',table:'published',idColumn:'id',revisionColumn:'revision',columns:['id','revision','projection']}]}} as ModulePackageManifest;
const event=()=>({moduleId:'test.owner',streamId:'approved_summary',eventType:'record.upsert',source:{installationId},recordId,recordRevision:1,payload:{id:recordId,revision:1,projection:{approved:true,count:10}}});

test('outbox batches retain declared legacy projections while binding package, stream and Worker identity',()=>{
    const batch=[event()];assert.deepEqual(boundReplicationEvents(manifest,batch,installationId),batch);assert.deepEqual(boundReplicationEvents(manifest,[],installationId),[]);
    const differentlyNamed={...manifest,replication:{contractVersion:1 as const,streams:[{streamId:'custom_summary',table:'custom_published',idColumn:'source_id',revisionColumn:'source_revision',columns:['source_id','source_revision','value']}]}};
    const custom={...event(),streamId:'custom_summary',payload:{source_id:recordId,source_revision:1,value:42}};assert.deepEqual(boundReplicationEvents(differentlyNamed,[custom],installationId),[custom]);
});
test('a private module cannot relabel an outbox event as another module, unknown stream or installation',()=>{
    for(const change of [{moduleId:'unrelated.legacy'},{streamId:'private_cases'},{source:{installationId:randomUUID()}},{eventType:'finding.issued'}])assert.throws(()=>boundReplicationEvents(manifest,[{...event(),...change}],installationId),/MODULE_REPLICATION_BINDING_MISMATCH/);
    assert.throws(()=>boundReplicationEvents({...manifest,replication:undefined} as unknown as ModulePackageManifest,[event()],installationId),/BINDING_MISMATCH/);
});
test('undeclared columns and identity/revision tampering reject the entire batch without echoing private data',()=>{
    const privateText='SYNTHETIC RESTRICTED CASE CONTENT';
    for(const payload of [{...event().payload,privateNote:privateText},{...event().payload,id:randomUUID()},{...event().payload,revision:2}]){
        assert.throws(()=>boundReplicationEvents(manifest,[event(),{...event(),payload}],installationId),e=>e instanceof Error&&e.message==='MODULE_REPLICATION_BINDING_MISMATCH'&&!e.message.includes(privateText));
    }
    assert.throws(()=>boundReplicationEvents(manifest,Array.from({length:11},event),installationId),/BINDING_MISMATCH/);
});

const sourceIdentity={installationId,role:'worker',entity:{entityId:randomUUID(),displayName:'Synthetic public organization'}};
const programManifest={...manifest,minimumPlatformVersion:'0.13.0',programServices:{contractVersion:1,domain:'participant-services',syntheticOnly:true},replication:{contractVersion:1,streams:[{streamId:'mission_aggregates_v1',table:'published',idColumn:'id',revisionColumn:'revision',columns:['id','revision','projection']}]}} as ModulePackageManifest;
const programEvent=()=>({...event(),envelopeVersion:1,payloadVersion:1,eventId:randomUUID(),destinationInstallationId:randomUUID(),sequence:'1',occurredAt:new Date().toISOString(),streamId:'mission_aggregates_v1',source:structuredClone(sourceIdentity),disclosure:{contractVersion:1,kind:'program-aggregate',domain:'participant-services'}});

test('declared program-service batches require trusted runtime identity and exact disclosure binding',()=>{
    const e=programEvent();assert.deepEqual(boundReplicationEvents(programManifest,[e],installationId,sourceIdentity),[e]);
    const withConfigurationVersion={...e,source:{...e.source,configVersion:1},correlationId:randomUUID()};assert.deepEqual(boundReplicationEvents(programManifest,[withConfigurationVersion],installationId,{...sourceIdentity,configVersion:1}),[withConfigurationVersion]);
    const resource={...programManifest,replication:{contractVersion:1 as const,streams:[{...programManifest.replication!.streams[0]!,streamId:'mission_resources_v1'}]}};const resourceEvent={...e,streamId:'mission_resources_v1'};assert.deepEqual(boundReplicationEvents(resource,[resourceEvent],installationId,sourceIdentity),[resourceEvent]);
    assert.throws(()=>boundReplicationEvents(programManifest,[e],installationId),/BINDING_MISMATCH/);assert.throws(()=>boundReplicationEvents(programManifest,[],installationId),/BINDING_MISMATCH/);
});

test('restricted case data cannot be smuggled through envelope, source, identity or disclosure metadata',()=>{
    const privateText='SYNTHETIC PRIVATE CASE TEXT';const e=programEvent();
    for(const changed of [
        {...e,privateNote:privateText},
        {...e,source:{...e.source,privateNote:privateText}},
        {...e,source:{...e.source,entity:{...e.source.entity,privateNote:privateText}}},
        {...e,source:{...e.source,entity:{...e.source.entity,displayName:privateText}}},
        {...e,source:{...e.source,entity:{...e.source.entity,entityId:randomUUID()}}},
        {...e,source:{...e.source,configVersion:2}},
        {...e,disclosure:{...e.disclosure,privateNote:privateText}},
        {...e,correlationId:privateText},
        {...e,sequence:privateText},
        {...e,occurredAt:privateText}
    ]) assert.throws(()=>boundReplicationEvents(programManifest,[e,changed],installationId,sourceIdentity),error=>error instanceof Error&&error.message==='MODULE_REPLICATION_BINDING_MISMATCH');
});

test('sensitive providers cannot omit or change the domain tag or masquerade as another stream/package',()=>{
    const e=programEvent(),withoutTag={...e} as Record<string,unknown>;delete withoutTag.disclosure;
    for(const changed of [withoutTag,{...e,disclosure:{...e.disclosure,domain:'food'}},{...e,disclosure:{...e.disclosure,kind:'private-case'}},{...e,disclosure:{...e.disclosure,contractVersion:2}},{...e,moduleId:'unrelated.legacy'},{...e,streamId:'private_cases'},{...e,eventType:'finding.issued'}])assert.throws(()=>boundReplicationEvents(programManifest,[changed],installationId,sourceIdentity),/BINDING_MISMATCH/);
    assert.throws(()=>boundReplicationEvents(programManifest,[e],installationId,{...sourceIdentity,entity:{...sourceIdentity.entity,entityId:randomUUID()}}),/BINDING_MISMATCH/);
});
