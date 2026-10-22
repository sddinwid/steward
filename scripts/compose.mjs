import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
const directory = path.resolve(process.env.STEWARD_DEPLOYMENT ?? '.steward/dev');
const args = ['compose', '-f', path.join(directory, 'compose.yaml')];
if (existsSync(path.join(directory, 'security', 'compose.yaml'))) args.push('-f', path.join(directory, 'security', 'compose.yaml'));
try { execFileSync('docker', [...args, ...process.argv.slice(2)], { stdio: 'inherit' }); }
catch (e) { process.exitCode = e.status ?? 1; }
