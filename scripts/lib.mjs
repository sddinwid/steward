import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
export const directory = path.resolve(process.argv[2] ?? '.steward/dev');
export async function manifest() { return JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')); }
export function docker(args) { return execFileSync('docker', args, { encoding: 'utf8', timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
export function compose(...args) {
  const files = ['-f', path.join(directory, 'compose.yaml')];
  if (existsSync(path.join(directory, 'security', 'compose.yaml'))) files.push('-f', path.join(directory, 'security', 'compose.yaml'));
  return docker(['compose', ...files, ...args]);
}
export function sql(key, query) { return compose('exec', '-T', `${key}-db`, 'psql', '-U', 'postgres', '-d', 'steward', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query); }
export async function json(url, expected = 200) {
  const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (response.status !== expected) throw new Error(`${url}: expected ${expected}, got ${response.status}`);
  return response.json();
}
