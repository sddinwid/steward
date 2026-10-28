import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
export const directory = path.resolve(process.argv[2] ?? '.steward/dev');
export async function manifest() { return JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')); }
export function docker(args) { return execFileSync('docker', args, { encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
export function compose(...args) {
  const files = ['-f', path.join(directory, 'compose.yaml')];
  if (existsSync(path.join(directory,'network/compose.yaml'))) files.push('-f',path.join(directory,'network/compose.yaml'));
  if (existsSync(path.join(directory, 'security', 'compose.yaml'))) files.push('-f', path.join(directory, 'security', 'compose.yaml'));
  if (existsSync(path.join(directory, 'modules', 'compose.yaml'))) files.push('-f', path.join(directory, 'modules', 'compose.yaml'));
  if (existsSync(path.join(directory, 'data/compose.yaml'))) files.push('-f', path.join(directory, 'data/compose.yaml'));
if (existsSync(path.join(directory, 'analyst/compose.yaml'))) files.push('-f', path.join(directory, 'analyst/compose.yaml'));
if (existsSync(path.join(directory, 'scientific/compose.yaml'))) files.push('-f', path.join(directory, 'scientific/compose.yaml'));
  if (existsSync(path.join(directory, 'commerce/compose.yaml'))) files.push('-f', path.join(directory, 'commerce/compose.yaml'));
  if (existsSync(path.join(directory, 'mission/compose.yaml'))) files.push('-f', path.join(directory, 'mission/compose.yaml'));
  if (existsSync(path.join(directory, 'economy/compose.yaml'))) files.push('-f', path.join(directory, 'economy/compose.yaml'));
  if (existsSync(path.join(directory, 'catalog/compose.yaml'))) files.push('-f', path.join(directory, 'catalog/compose.yaml'));
  if (existsSync(path.join(directory, 'release/compose.yaml'))) files.push('-f', path.join(directory, 'release/compose.yaml'));
  if(process.env.STEWARD_COMPOSE_OVERRIDE_FILE){const override=path.resolve(directory,process.env.STEWARD_COMPOSE_OVERRIDE_FILE);const relative=path.relative(directory,override);if(relative.startsWith('..')||path.isAbsolute(relative)||!existsSync(override))throw new Error('Compose override must be an existing file inside the selected deployment');files.push('-f',override);}
  return docker(['compose', ...files, ...args]);
}
export function sql(key, query) { return compose('exec', '-T', `${key}-db`, 'psql', '-U', 'postgres', '-d', 'steward', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query); }
export async function json(url, expected = 200) {
  const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (response.status !== expected) throw new Error(`${url}: expected ${expected}, got ${response.status}`);
  return response.json();
}
