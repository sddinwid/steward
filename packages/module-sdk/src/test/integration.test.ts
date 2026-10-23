import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {authorizeCommand,validateCommand,validateIntegration,INTEGRATION_PROTOCOL,type IntegrationCommand,type ModulePackageManifest} from '../index.js';
const manifest=(id:string,peer:string,sends:string[],receives:string[]):ModulePackageManifest=>({manifestVersion:1,sdkVersion:1,name:id,description:'Contract test',minimumPlatformVersion:'0.7.0',dependencies:[],requiredPermissions:[],ui:[],configurationSchema:{type:'object',additionalProperties:false},persistence:{isolation:'dedicated-database',destructiveRollback:false,schemaVersion:1,migrations:[{version:1,sha256:'a'.repeat(64)}]},integrationEvents:[],analyticalCapabilities:[],moduleId:id,version:'1.0.0',api:[],integration:{version:1,outboxPath:'/integration-outbox',acknowledgmentPath:'/integration-acks',inboxPath:'/integration-inbox',peers:[{moduleId:peer,minimumVersion:'1.0.0',sends:sends.map(command=>({command,version:1})),receives:receives.map(command=>({command,version:1}))}]}});
const source=manifest('example.sales','example.stock',['reserve'],[]),target=manifest('example.stock','example.sales',[],['reserve']);
const command:IntegrationCommand={protocol:INTEGRATION_PROTOCOL,commandId:randomUUID(),sourceModuleId:source.moduleId,targetModuleId:target.moduleId,command:'reserve',version:1,aggregateId:randomUUID(),sequence:1,occurredAt:new Date().toISOString(),payload:{sku:'sample',quantity:2}};
test('signed bilateral versioned contracts require both enabled peers and exact identities',()=>{
 authorizeCommand(command,source,target,{source:true,target:true});
 for(const flags of [{source:false,target:true},{source:true,target:false}])assert.throws(()=>authorizeCommand(command,source,target,flags),/DISABLED/);
 assert.throws(()=>authorizeCommand({...command,sourceModuleId:'example.other'},source,target,{source:true,target:true}),/IDENTITY/);
 assert.throws(()=>authorizeCommand({...command,command:'increase'},source,target,{source:true,target:true}),/AUTHORIZED/);
 assert.throws(()=>authorizeCommand(command,source,{...target,version:'0.9.0'},{source:true,target:true}),/AUTHORIZED/);
 assert.throws(()=>authorizeCommand(command,source,{...target,integration:{...target.integration!,peers:[]}},{source:true,target:true}),/AUTHORIZED/);
});
test('integration metadata cannot expose private endpoints or executable paths',()=>{
 validateIntegration(source);
 assert.throws(()=>validateIntegration({...source,api:[{operationId:'unsafe',method:'POST',path:'/integration-inbox',permission:'example.sales.write'}]}));
 assert.throws(()=>validateIntegration({...source,integration:{...source.integration!,outboxPath:'http://arbitrary.invalid'}}));
 assert.throws(()=>validateIntegration({...source,integration:{...source.integration!,peers:[{...source.integration!.peers[0]!,moduleId:source.moduleId}]}}));
});
test('integration identity digests bind complete payload and reject oversized/malformed envelopes',()=>{
 assert.notEqual(validateCommand(command),validateCommand({...command,payload:{quantity:3}}));
 for(const change of [{commandId:'unsafe'},{sequence:0},{version:2},{payload:[]},{payload:{text:'x'.repeat(33000)}},{occurredAt:'invalid'}])assert.throws(()=>validateCommand({...command,...change} as IntegrationCommand));
});
