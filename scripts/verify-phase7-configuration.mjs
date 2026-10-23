// Fault injection into this test deployment only: model a lost core commit
// after the provider persisted a configuration. Never edit business databases.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {directory,sql,json,manifest} from './lib.mjs';
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');process.env.STEWARD_DEMO_RETRY_LOGIN='1';
const {api,logins}=await import('./phase4-client.mjs');await logins();const worker='worker-1',module='cee.inventory',configuration=(await api(worker,'/api/v3/modules')).value.installed.find(m=>m.moduleId===module).configuration;
const report={startedAt:new Date().toISOString(),checks:[]};
try{
 await api(worker,'/api/v3/modules/'+module+'/configuration','PUT',{configuration:{...configuration,integrationsEnabled:false}});
 const encoded=JSON.stringify(configuration).replaceAll("'","''");sql(worker,"UPDATE module_installations SET configuration='"+encoded+"'::jsonb WHERE module_id='cee.inventory'");
 const denied=(await api(worker,'/api/v3/modules/'+module+'/api/items','GET',undefined,503)).value;assert.equal(denied.error,'MODULE_CONFIGURATION_MISMATCH');
 const deployment=await manifest();assert.equal((await json('http://127.0.0.1:'+deployment.instances.find(i=>i.key===worker).apiPort+'/health')).status,'ok');assert(Array.isArray((await api(worker,'/api/v3/modules/cee.procurement/api/orders')).value.records));
 report.checks.push('Provider/core configuration mismatch fails the affected module proxy closed while Worker health and other modules remain available');
}catch(error){report.status='failed';report.failure=error.message;throw error;}
finally{await api(worker,'/api/v3/modules/'+module+'/configuration','PUT',{configuration});const recovered=(await api(worker,'/api/v3/modules/'+module+'/api/items')).value;assert(Array.isArray(recovered.records));report.configurationRestored=true;if(!report.failure){report.status='passed';report.checks.push('Explicit idempotent configuration retry reconciled provider and core; data and credentials retained');}await writeFile('artifacts/phase7-configuration.json',JSON.stringify(report,null,2)+'\n');}
console.log('PASS configuration interruption fails closed, leaves independent services healthy and recovers through the authorized configuration API');
