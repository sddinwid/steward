import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {request} from 'node:https';
import type {InstallationConfig} from '@steward/contracts';
import type {SignedModulePackage} from '@steward/module-sdk';
import {boundedLookup} from '@steward/module-sdk';
import {signAssertion} from './security/crypto.js';
/** Only operator-actionable static codes may cross the configuration boundary. */
export function configurationFailure(error:unknown):string {
 const allowed=['CONNECTOR_PRIVATE_CONFIGURATION_REQUIRED','CONNECTOR_PRIVATE_CONFIGURATION_INVALID','CONNECTOR_EGRESS_GRANT_REQUIRED','CONNECTOR_EGRESS_GRANT_MISMATCH','CONNECTOR_EGRESS_NETWORK_REQUIRED','CONNECTOR_EGRESS_NETWORK_UNTRUSTED','CONNECTOR_EGRESS_IDENTITY_CHANGED'];
 return typeof error==='string'&&allowed.includes(error)?error:'MODULE_CONFIGURATION_UNAVAILABLE';
}
export async function createModuleBroker(configFile:string,installation:InstallationConfig,key:string){
 const runtime=JSON.parse(await readFile(configFile,'utf8'));
  async function send(operation: string, descriptor: SignedModulePackage, configuration: unknown, extra = {}): Promise<{ status: number; value: any }> {
    const payload = { protocol: 'steward-module-control-v1', installationId: installation.installationId, nonce: randomUUID(), issuedAt: Date.now(), operation,
      moduleId: descriptor.payload.manifest.moduleId, version: descriptor.payload.manifest.version, configuration, ...extra };
    const body = JSON.stringify(signAssertion(payload, key));
    const ca = await readFile(runtime.caFile);
    return new Promise(resolve => {
      const unavailable=()=>resolve({status:503,value:{error:'MODULE_RUNTIME_UNAVAILABLE',recovery:'Module runtime is unavailable. Retained operations will reconcile after recovery.'}});
      const req = request(new URL('/control', runtime.brokerUrl), { method: 'POST', ca, servername: runtime.tlsServerName, rejectUnauthorized: true, timeout: ['proxy','inspect','webhook'].includes(operation)?4000:60000, signal: AbortSignal.timeout(['proxy','inspect','webhook'].includes(operation)?4000:60000), lookup: boundedLookup,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, res => {
        let value = ''; res.setEncoding('utf8'); res.on('data', chunk => { value += chunk; if (value.length > 1048576) req.destroy(new Error('Module response too large')); });
        res.on('end', () => { try { resolve({ status: res.statusCode ?? 503, value: JSON.parse(value) }); } catch { unavailable(); } });
      });
      req.on('timeout', () => req.destroy(new Error('Module runtime timeout'))); req.on('error', unavailable); req.end(body);
    });
  }

 return (operation:string,descriptor:SignedModulePackage,configuration:unknown,extra={})=>retryLifecycleContention(operation,()=>send(operation,descriptor,configuration,extra));
}

/** A 409 lock rejection precedes effects. Never retry an uncertain transport or a module business action. */
export async function retryLifecycleContention<T extends {status:number;value:any}>(operation:string,send:()=>Promise<T>,pause:(ms:number)=>Promise<void>=ms=>new Promise(r=>setTimeout(r,ms))):Promise<T>{
 const lifecycle=['install','activate','deactivate','configure'].includes(operation);for(let attempt=0;;attempt++){const result=await send();if(!lifecycle||result.status!==409||result.value?.error!=='OPERATION_IN_PROGRESS'||attempt>=7)return result;await pause(Math.min(100*2**attempt,800));}
}
/** Recovered upgrade authority is restricted to the original explicit immutable request identity. */
export function boundInstallationRecovery(existing:{operation_id:string;state:string}|undefined,request:{operationId:string;recover?:boolean}){return !!existing&&request.recover===true&&existing.operation_id===request.operationId&&['failed','installing'].includes(existing.state);}
