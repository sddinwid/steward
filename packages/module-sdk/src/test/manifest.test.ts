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
