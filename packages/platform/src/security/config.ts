import { readFile } from 'node:fs/promises';
import { publicKey, normalizePublicKey } from './crypto.js';
export interface TrustedMaster {
  profileId: string;
  apiUrl: string;
  browserUrl: string;
  installationId: string;
  publicKey: string;
  caFile: string;
}
export interface SecurityConfig {
  version: 1;
  publicOrigin: string;
  tlsKeyFile: string;
  tlsCertFile: string;
  /** Public issuer CA for exporting a pinned peer profile (never a key). */
  tlsCaFile?: string;
  identityKeyFile: string;
  trustedMasters: TrustedMaster[];
}
function origin(value: string): boolean {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && url.origin === value;
}
export async function loadSecurityConfig(file: string): Promise<{ config: SecurityConfig; key: string }> {
  const config: SecurityConfig = JSON.parse(await readFile(file, 'utf8'));
  if (config.version !== 1 || !origin(config.publicOrigin) || !Array.isArray(config.trustedMasters)) throw new Error('Invalid security configuration');
  for (const profile of config.trustedMasters) {
    if (!/^[a-z0-9-]{1,80}$/.test(profile.profileId) || !origin(profile.apiUrl) || !origin(profile.browserUrl)) throw new Error('Invalid trust profile');
    profile.publicKey = normalizePublicKey(profile.publicKey);
  }
  if (new Set(config.trustedMasters.map(p => p.profileId)).size !== config.trustedMasters.length) throw new Error('Duplicate trust profile');
  const key = await readFile(config.identityKeyFile, 'utf8');
  publicKey(key);
  return { config, key };
}
