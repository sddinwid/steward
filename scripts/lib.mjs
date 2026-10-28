import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import {deploymentOverlayFiles} from './select-deployment.mjs';
export const directory = path.resolve(process.argv[2] ?? '.steward/dev');
export async function manifest() { return JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')); }
export function docker(args) { return execFileSync('docker', args, { encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
export function compose(...args) {
  if(!existsSync(path.join(directory,'compose.yaml')))throw new Error('Existing deployment Compose configuration required; no default stack was selected');
  const files = deploymentOverlayFiles(directory).flatMap(file=>['-f',path.join(directory,file)]);
  if(process.env.STEWARD_COMPOSE_OVERRIDE_FILE){const override=path.resolve(directory,process.env.STEWARD_COMPOSE_OVERRIDE_FILE);const relative=path.relative(directory,override);if(relative.startsWith('..')||path.isAbsolute(relative)||!existsSync(override))throw new Error('Compose override must be an existing file inside the selected deployment');files.push('-f',override);}
  return docker(['compose', ...files, ...args]);
}
export function sql(key, query) { return compose('exec', '-T', `${key}-db`, 'psql', '-U', 'postgres', '-d', 'steward', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query); }
export async function json(url, expected = 200) {
  const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (response.status !== expected) throw new Error(`${url}: expected ${expected}, got ${response.status}`);
  return response.json();
}
