import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {request} from 'node:https';
import type {InstallationConfig} from '@steward/contracts';
import type {SignedModulePackage} from '@steward/module-sdk';
import {boundedLookup} from '@steward/module-sdk';
import {signAssertion} from './security/crypto.js';
export async function createModuleBroker(configFile:string,installation:InstallationConfig,key:string){
 const runtime=JSON.parse(await readFile(configFile,'utf8'));
  async function broker(operation: string, descriptor: SignedModulePackage, configuration: unknown, extra = {}): Promise<{ status: number; value: any }> {
    const payload = { protocol: 'steward-module-control-v1', installationId: installation.installationId, nonce: randomUUID(), issuedAt: Date.now(), operation,
      moduleId: descriptor.payload.manifest.moduleId, version: descriptor.payload.manifest.version, configuration, ...extra };
    const body = JSON.stringify(signAssertion(payload, key));
    const ca = await readFile(runtime.caFile);
    return new Promise((resolve, reject) => {
      const req = request(new URL('/control', runtime.brokerUrl), { method: 'POST', ca, servername: runtime.tlsServerName, rejectUnauthorized: true, timeout: 60000, signal: AbortSignal.timeout(60000), lookup: boundedLookup,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, res => {
        let value = ''; res.setEncoding('utf8'); res.on('data', chunk => { value += chunk; if (value.length > 1048576) req.destroy(new Error('Module response too large')); });
        res.on('end', () => { try { resolve({ status: res.statusCode ?? 503, value: JSON.parse(value) }); } catch { reject(new Error('Module runtime response invalid')); } });
      });
      req.on('timeout', () => req.destroy(new Error('Module runtime timeout'))); req.on('error', reject); req.end(body);
    });
  }

 return broker;
}
