import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { boundedLookup } from '../network.js';
import { assertCompatible, operationFor, signPackage, verifyPackage, validateConfiguration, validateManifest, type ModulePackageManifest } from '../index.js';
const m: ModulePackageManifest = {
  manifestVersion: 1, sdkVersion: 1, moduleId: 'example.records', version: '1.0.0', name: 'Records', description: 'Test package', minimumPlatformVersion: '0.3.0', dependencies: [],
  requiredPermissions: ['storage.own-database'], api: [{ operationId: 'list', method: 'GET', path: '/records', permission: 'example.records.read' },
    { operationId: 'create', method: 'POST', path: '/records', permission: 'example.records.write' }, { operationId: 'update', method: 'PUT', path: '/records/:id', permission: 'example.records.write' }],
  ui: [{ screenId: 'records', title: 'Records', navigationLabel: 'Records', listOperation: 'list', createOperation: 'create', updateOperation: 'update', fields: [{ name: 'name', label: 'Name', type: 'string', required: true }], columns: ['name'] }],
  configurationSchema: { type: 'object', additionalProperties: false, required: ['unit'], properties: { unit: { type: 'string', minLength: 1 } } },
  persistence: { isolation: 'dedicated-database', schemaVersion: 1, migrations: [{ version: 1, sha256: 'a'.repeat(64) }], destructiveRollback: false }, integrationEvents: [], analyticalCapabilities: []
};
test('Phase13 programme administration and finance contributions stay bounded without widening legacy packages',()=>{const api=Array.from({length:96},(_,i)=>({operationId:'read'+i,method:'GET' as const,path:'/records-'+i,permission:'example.records.read'}));const ui=Array.from({length:20},(_,i)=>({screenId:'records-'+i,title:'Records',navigationLabel:'Records',listOperation:'read0',fields:[],columns:[]}));validateManifest({...m,minimumPlatformVersion:'0.13.0',api,ui});assert.throws(()=>validateManifest({...m,minimumPlatformVersion:'0.12.0',api:api.slice(0,31),ui:[]}));assert.throws(()=>validateManifest({...m,minimumPlatformVersion:'0.12.0',api:api.slice(0,1),ui:ui.slice(0,11)}));assert.throws(()=>validateManifest({...m,minimumPlatformVersion:'0.13.0',api:[...api,{...api[0]!,operationId:'excess',path:'/excess'}],ui}));assert.throws(()=>validateManifest({...m,minimumPlatformVersion:'0.13.0',api,ui:[...ui,{...ui[0]!,screenId:'excess'}]}));});
test('programme module declarations permit only aggregate disclosure streams',()=>{
 const p:ModulePackageManifest={...m,minimumPlatformVersion:'0.13.0',programServices:{contractVersion:1,domain:'housing',syntheticOnly:true},replication:{contractVersion:1,streams:[{streamId:'mission_aggregates_v1',table:'mission_aggregate_releases',idColumn:'id',revisionColumn:'revision',columns:['id','revision','projection']}]}};
 validateManifest(p);
 for(const change of [{minimumPlatformVersion:'0.12.0'},{replication:undefined},{programServices:{contractVersion:1,domain:'housing',syntheticOnly:false}},{replication:{contractVersion:1,streams:[{...p.replication!.streams[0],streamId:'private_cases'}]}},{replication:{contractVersion:1,streams:[{...p.replication!.streams[0],columns:['id','revision','projection','case_notes']}]}}])assert.throws(()=>validateManifest({...p,...change} as ModulePackageManifest));
});
test('signed form references and generated identities remain bounded data declarations',()=>{
 const field={name:'programId',label:'Program',type:'string' as const,required:true,reference:{operationId:'list',valueField:'id',labelField:'name'}};
 const p={...m,minimumPlatformVersion:'0.13.0',ui:[{...m.ui[0]!,fields:[field,{name:'reference',label:'Synthetic reference',type:'string' as const,required:true,generate:'synthetic-participant' as const}],columns:['reference']}]};validateManifest(p);
 for(const bad of [{reference:{...field.reference,operationId:'create'}},{reference:{...field.reference,valueField:'__proto__'}},{reference:{...field.reference,endpoint:'https://untrusted.invalid'}},{generate:'arbitrary-code'},{generate:'uuid',enum:['fixed']},{generate:'uuid',readOnly:true},{generate:'uuid',reference:field.reference}])assert.throws(()=>validateManifest({...p,ui:[{...p.ui[0]!,fields:[{...field,...bad}]}]} as ModulePackageManifest));
 assert.throws(()=>validateManifest({...p,minimumPlatformVersion:'0.12.0'}));
});
test('module-contributed workspace, bounded polling, form defaults and confirmations remain data-only',()=>{
 const screen={...m.ui[0]!,workspace:'administration' as const,refreshMs:3000,columns:['scenario'],fields:[{name:'scenario',label:'Scenario',type:'string' as const,required:false,enum:['normal','delay'],default:'normal'}]};
 validateManifest({...m,minimumPlatformVersion:'0.11.0',ui:[screen]});assert.throws(()=>validateManifest({...m,minimumPlatformVersion:'0.10.0',ui:[screen]}));
 for(const change of [{workspace:'arbitrary'},{refreshMs:1},{refreshMs:Infinity},{script:'fetch(secret)'},{fields:[{...screen.fields[0],default:'unlisted'}]}])assert.throws(()=>validateManifest({...m,ui:[{...screen,...change}]} as ModulePackageManifest));
});
test('signed MCP contributions can only target declared read-only parameterless APIs',()=>{
 validateManifest({...m,mcpTools:[{name:'get_records',description:'Read local records',operationId:'list'}]});
 validateManifest({...m,ui:[],mcpTools:[{name:'get_records',description:'Headless read contribution',operationId:'list'}]});
 for(const operationId of ['create','update','missing'])assert.throws(()=>validateManifest({...m,mcpTools:[{name:'get_records',description:'Read local records',operationId}]}));
 assert.throws(()=>validateManifest({...m,mcpTools:[{name:'../code',description:'Invalid',operationId:'list'}]}));
});
test('replication projections reject executable identifiers and equivalent schemas retain validation',()=>{
  const valid={...m,replication:{contractVersion:1 as const,streams:[{streamId:'records',table:'records',idColumn:'id',revisionColumn:'revision',columns:['id','revision','name']}]}};
  validateManifest(valid);
  assert.throws(()=>validateManifest({...valid,replication:{contractVersion:1,streams:[{...valid.replication.streams[0]!,table:'records; DROP TABLE users'}]}}));
  for(let i=0;i<120;i++)validateConfiguration(structuredClone(valid),{unit:'items'});
  assert.throws(()=>validateConfiguration(structuredClone(valid),{unit:'items',extra:true}));
});
test('outbound resolution preserves literal addresses and requested address family without DNS work',async()=>{
 const addresses=await new Promise((resolve,reject)=>boundedLookup('127.0.0.1',{all:true},(error:Error|null,result:unknown)=>error?reject(error):resolve(result)));
 assert.deepEqual(addresses,[{address:'127.0.0.1',family:4}]);
 const error=await new Promise(resolve=>boundedLookup('127.0.0.1',{family:6},(error:Error)=>resolve(error)));
 assert.equal((error as any).code,'ENOTFOUND');
});
test('signed packages reject tampering, unknown publishers, and changed immutable image identity', () => {
  const keys = generateKeyPairSync('ed25519');
  const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const p = signPackage({ formatVersion: 1, publisherId: 'test', imageId: 'sha256:' + 'a'.repeat(64), manifest: m }, privateKey);
  const trust = { publishers: [{ publisherId: 'test', publicKey }] };
  assert.equal(verifyPackage(p, trust).manifest.moduleId, m.moduleId);
  assert.throws(() => verifyPackage(p, { publishers: [] }));
  assert.throws(() => verifyPackage({ ...p, payload: { ...p.payload, imageId: 'sha256:' + 'b'.repeat(64) } }, trust));
});
test('SDK rejects unsafe paths, foreign permissions, and destructive persistence', () => {
  validateManifest(m);
  for (const change of [{ sdkVersion: 2 }, { requiredPermissions: ['host.execute'] }, { api: [{ ...m.api[0], path: '/../../admin' }] },
    { api: [{ ...m.api[0], permission: 'accounts.admin' }] }, { ui: [{ ...m.ui[0], fields: [{ name: '__proto__', label: 'Bad', type: 'string', required: true }] }] },
    { ui: [{ ...m.ui[0], scriptUrl: 'https://untrusted.invalid/code.js' }] },
    { persistence: { ...m.persistence, destructiveRollback: true } }]) assert.throws(() => validateManifest({ ...m, ...change } as ModulePackageManifest));
  assert.equal(operationFor(m, 'GET', '/records')?.operationId, 'list');
  assert.equal(operationFor(m, 'PUT', '/records/12345678-1234-4234-8234-123456789abc')?.operationId, 'update');
  assert.equal(operationFor(m, 'DELETE', '/records'), undefined);
  assert.equal(operationFor(m, 'GET', '/internal/migrate'), undefined);
});
test('compatibility, active dependencies, and closed configuration schemas are enforced', () => {
  assertCompatible(m, '0.3.0', []);
  assert.throws(() => assertCompatible(m, '0.2.0', []));
  const dependent = { ...m, dependencies: [{ moduleId: 'example.base', minimumVersion: '1.2.0' }] };
  assert.throws(() => assertCompatible(dependent, '0.3.0', []));
  assert.throws(() => assertCompatible(dependent, '0.3.0', [{ moduleId: 'example.base', version: '1.3.0', state: 'disabled' }]));
  assertCompatible(dependent, '0.3.0', [{ moduleId: 'example.base', version: '1.3.0', state: 'active' }]);
  validateConfiguration(m, { unit: 'pieces' });
  assert.throws(() => validateConfiguration(m, {}));
  assert.throws(() => validateConfiguration(m, { unit: 'pieces', hostCommand: 'anything' }));
});

test('bounded query declarations and permission-bound actions preserve old CRUD manifests',()=>{
 const extended:ModulePackageManifest={...m,api:[{...m.api[0]!,query:['limit','offset','fields']},...m.api.slice(1),{operationId:'approve',method:'POST',path:'/approve/:id',permission:'example.records.approve'}],ui:[{...m.ui[0]!,actions:[{label:'Approve',operationId:'approve'}]}]};
 validateManifest(extended);assert.equal(operationFor(extended,'GET','/records?limit=5&offset=0')?.operationId,'list');
 for(const path of ['/records?url=https://foreign.invalid','/records?limit=1&limit=2','/records?fields='+('a'.repeat(301)),'/records#unsafe'])assert.equal(operationFor(extended,'GET',path),undefined);
 assert.equal(operationFor(m,'GET','/records?limit=5'),undefined);
 assert.throws(()=>validateManifest({...extended,ui:[{...extended.ui[0]!,actions:[{label:'Read as mutation',operationId:'list'}]}]}));
 const {createOperation,updateOperation,...readOnly}=m.ui[0]!;
 validateManifest({...m,ui:[readOnly]});
 assert.throws(()=>validateManifest({...m,api:[{...m.api[1]!,query:['limit']}]}));
});

const typedScreen={screenId:'preview',title:'Preview',navigationLabel:'Preview',formVersion:1 as const,navigationGroup:'Commercial planning',preview:{version:1 as const,operationId:'create'},fields:[{name:'kind',label:'Kind',type:'string' as const,required:true,enum:['physical','service']},{name:'physical',label:'Physical details',type:'object' as const,required:false,visibleWhen:{field:'kind',equals:'physical'},fields:[{name:'enabled',label:'Enabled',type:'boolean' as const,required:true,default:false}]},{name:'components',label:'Components',type:'array' as const,required:true,maxItems:10,items:{name:'component',label:'Component',type:'object' as const,required:true,fields:[{name:'related',label:'Related',type:'string' as const,required:true,reference:{operationId:'list',valueField:'id',labelField:'name'}},{name:'price',label:'Price',type:'number' as const,format:'money' as const,required:true,minimum:0}]}},{name:'startsAt',label:'Starts',type:'string' as const,format:'date-time' as const,required:true}],columns:[]};
test('Phase15 typed forms and preview-only screens are versioned closed bounded signed data',()=>{
 const p={...m,minimumPlatformVersion:'0.15.0',ui:[typedScreen]};validateManifest(p);
 assert.throws(()=>validateManifest({...p,minimumPlatformVersion:'0.14.0'}));
 const badScreens=[{formVersion:2},{preview:{version:1,operationId:'list'}},{preview:{version:1,operationId:'update'}},{createOperation:'create'},{refreshMs:2000},{navigationGroup:'unsafe\nlabel'},{listOperation:'missing'},{script:'run()'},{fields:[{...typedScreen.fields[2],maxItems:101}]},{fields:[{...typedScreen.fields[2],maxItems:undefined}]},{fields:[{...typedScreen.fields[1],visibleWhen:{field:'__proto__',equals:'physical'}}]},{fields:[{...typedScreen.fields[0]},{...typedScreen.fields[0]}]}];
 for(const change of badScreens)assert.throws(()=>validateManifest({...p,ui:[{...typedScreen,...change}]} as ModulePackageManifest),JSON.stringify(change));
 let nested:any={name:'leaf',label:'Leaf',type:'string',required:true};for(let i=0;i<6;i++)nested={name:'nested',label:'Nested',type:'object',required:true,fields:[nested]};assert.throws(()=>validateManifest({...p,ui:[{...typedScreen,fields:[nested]}]}));
 for(const field of [{name:'prototype',label:'Bad',type:'string',required:true},{name:'items',label:'Items',type:'array',required:true,maxItems:2,items:{name:'entry',label:'Entry',type:'string',required:true,script:'run()'}},{name:'value',label:'Value',type:'number',required:true,format:'date'},{name:'value',label:'Value',type:'boolean',required:true,default:'true'}])assert.throws(()=>validateManifest({...p,ui:[{...typedScreen,fields:[field]}]} as ModulePackageManifest));
});
test('signed approval context declares an existing module API permission without granting authority',()=>{
 const p={...m,minimumPlatformVersion:'0.15.0',approvalServices:{contractVersion:1 as const,reviewerPermission:'example.records.write'}};validateManifest(p);
 for(const change of [{minimumPlatformVersion:'0.14.0'},{approvalServices:{contractVersion:2,reviewerPermission:'example.records.write'}},{approvalServices:{contractVersion:1,reviewerPermission:'other.admin'}},{approvalServices:{contractVersion:1,reviewerPermission:'storage.own-database'}},{approvalServices:{contractVersion:1,reviewerPermission:'example.records.write',grant:true}}])assert.throws(()=>validateManifest({...p,...change} as ModulePackageManifest));
});
