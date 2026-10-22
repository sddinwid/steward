import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import path from 'node:path';
try {
  const { values, positionals } = parseArgs({ options: { 'password-file': { type: 'string' }, 'generate-password-file': { type: 'string' } }, allowPositionals: true });
  const [service, username, role] = positionals;
  const directory = path.resolve(process.env.STEWARD_DEPLOYMENT ?? '.steward/dev');
  const deployment = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (positionals.length !== 3 || !deployment.instances.some(i => i.key === service) || !!values['password-file'] === !!values['generate-password-file']) throw new Error('Usage: node scripts/create-account.mjs INSTALLATION USERNAME ROLE --password-file PATH | --generate-password-file PATH');
  const securityDir = path.join(directory, 'security');
  if (!existsSync(path.join(securityDir, 'compose.yaml'))) throw new Error('Provision security first');
  let password;
  if (values['generate-password-file']) {
    const file = path.resolve(values['generate-password-file']);
    if (!file.startsWith(securityDir + path.sep)) throw new Error('Generated password files must be under the private security directory');
    password = randomBytes(32).toString('base64url');
    await writeFile(file, password + '\n', { flag: 'wx', mode: 0o600 });
  } else password = (await readFile(values['password-file'], 'utf8')).replace(/[\r\n]+$/, '');
  execFileSync('docker', ['compose', '-f', path.join(directory, 'compose.yaml'), '-f', path.join(securityDir, 'compose.yaml'), 'exec', '-T', `${service}-api`, 'node', 'packages/platform/dist/security/admin-cli.js', '--username', username, '--role', role, '--password-stdin'], { input: password + '\n', stdio: ['pipe', 'pipe', 'pipe'] });
  console.log(`Created ${username} on ${service}. Read the password file privately; the password was not printed.`);
} catch (e) { console.error(e.message?.startsWith('Usage:') ? e.message : 'Account creation failed. Check the deployment, role, username, password file, and uniqueness.'); process.exitCode = 1; }
