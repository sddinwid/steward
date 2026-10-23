// Controlled interrupted-state fixture; this is not a model-validation result.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
import {directory} from './lib.mjs';
const recovery=path.join(directory,'analyst/local-provider-recovery.json'),lock=path.join(directory,'analyst/.local-provider-lock');
const config=path.join(directory,'analyst/config/model.json'),key=path.join(directory,'analyst/config/api-key.txt');
const priorConfig=await readFile(config),priorKey=await readFile(key);await mkdir(lock);
const model='steward-analyst-qwen2.5-ctx16384:7b',probe=Buffer.from('{"controlledRecoveryProbe":true}\n');
const data={pid:process.pid,createdAt:new Date().toISOString(),config:priorConfig.toString('base64'),key:priorKey.toString('base64'),model};
let owned=false;
try{
 await writeFile(recovery,JSON.stringify(data),{flag:'wx',mode:0o600});owned=true;await writeFile(config,probe);await writeFile(key,randomBytes(32).toString('hex')+'\n');
 let refused=false;try{execFileSync(process.execPath,['scripts/recover-local-provider.mjs',directory],{stdio:'pipe'});}catch(e){refused=e.status===1&&e.stderr.toString().includes('still active');}assert.ok(refused);assert.deepEqual(await readFile(config),probe);
 data.pid=Number(execFileSync(process.execPath,['-e','console.log(process.pid)'],{encoding:'utf8'}).trim());await writeFile(recovery,JSON.stringify(data));
 execFileSync(process.execPath,['scripts/recover-local-provider.mjs',directory],{stdio:'inherit'});
 assert.deepEqual(await readFile(config),priorConfig);assert.deepEqual(await readFile(key),priorKey);
 const loaded=await(await fetch('http://127.0.0.1:11434/api/ps')).json();assert.ok(!loaded.models.some(m=>m.name===model));
 await writeFile('artifacts/phase6-provider-recovery.json',JSON.stringify({verifiedAt:new Date().toISOString(),fixture:'controlled interrupted-state recovery; not a real investigation',activeProcessRecoveryRefused:true,exitedProcessRecoveryPassed:true,exactConfigurationAndSecretBytesRestored:true,modelUnloaded:true},null,2)+'\n');
 console.log('PASS recovery refuses an active presenter PID, restores exact private configuration after process exit and unloads the context alias.');
}finally{if(owned){await writeFile(config,priorConfig);await writeFile(key,priorKey);await unlink(recovery).catch(e=>{if(e.code!=='ENOENT')throw e;});}await rmdir(lock).catch(e=>{if(e.code!=='ENOENT')throw e;});}
