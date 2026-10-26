import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
const directory = path.resolve(process.env.STEWARD_DEPLOYMENT ?? '.steward/dev');
const args = ['compose', '-f', path.join(directory, 'compose.yaml')];
if (existsSync(path.join(directory, 'network/compose.yaml'))) args.push('-f', path.join(directory, 'network/compose.yaml'));
if (existsSync(path.join(directory, 'security', 'compose.yaml'))) args.push('-f', path.join(directory, 'security', 'compose.yaml'));
if (existsSync(path.join(directory, 'modules', 'compose.yaml'))) args.push('-f', path.join(directory, 'modules', 'compose.yaml'));
if (existsSync(path.join(directory, 'data/compose.yaml'))) args.push('-f', path.join(directory, 'data/compose.yaml'));
if (existsSync(path.join(directory, 'analyst/compose.yaml'))) args.push('-f', path.join(directory, 'analyst/compose.yaml'));
if (existsSync(path.join(directory, 'scientific/compose.yaml'))) args.push('-f', path.join(directory, 'scientific/compose.yaml'));
if (existsSync(path.join(directory, 'commerce/compose.yaml'))) args.push('-f', path.join(directory, 'commerce/compose.yaml'));
if (existsSync(path.join(directory, 'mission/compose.yaml'))) args.push('-f', path.join(directory, 'mission/compose.yaml'));
if (existsSync(path.join(directory, 'economy/compose.yaml'))) args.push('-f', path.join(directory, 'economy/compose.yaml'));
if (existsSync(path.join(directory, 'release/compose.yaml'))) args.push('-f', path.join(directory, 'release/compose.yaml'));
if(process.env.STEWARD_COMPOSE_OVERRIDE_FILE){const override=path.resolve(directory,process.env.STEWARD_COMPOSE_OVERRIDE_FILE);const relative=path.relative(directory,override);if(relative.startsWith('..')||path.isAbsolute(relative)||!existsSync(override))throw new Error('Compose override must be an existing file inside the selected deployment');args.push('-f',override);}
try {
  const action = process.argv[2];
  if (existsSync(path.join(directory, 'modules/compose.yaml')) && (action === 'down' || action === 'stop' && process.argv.length === 3)) {
    const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    const workers = manifest.instances.filter(i => i.role === 'worker');
    // Providers must be stopped before removing their disposable containers.
    if (workers.length) execFileSync('docker', [...args, 'stop', ...workers.map(i => i.key + '-module-host')], { stdio: 'inherit' });
    for (const worker of workers) {
      const ids = execFileSync('docker', ['ps', '-aq', '--filter', 'label=steward.managed-by=module-host-v1', '--filter', 'label=steward.installation=' + worker.installationId], { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean);
      if (ids.length) {
        execFileSync('docker', ['stop', ...ids], { stdio: 'inherit' });
        if (action === 'down') execFileSync('docker', ['rm', ...ids], { stdio: 'inherit' });
      }
    }
  }
  execFileSync('docker', [...args, ...process.argv.slice(2)], { stdio: 'inherit' });
}
catch (e) { process.exitCode = e.status ?? 1; }
