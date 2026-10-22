import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { mkdir, readFile, writeFile, mkdtemp, rename, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { Manifest } from './provision.js';
import { privateDirectory } from './security.js';
const q = (s: string) => JSON.stringify(s.replaceAll('\\', '/'));
export async function provisionModules(directory: string, sourceRoot: string) {
  directory = path.resolve(directory);
  const manifest: Manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  await readFile(path.join(directory, 'security', 'compose.yaml'));
  const target = path.join(directory, 'modules');
  const lock = path.join(directory, '.module-provision-lock');
  await mkdir(lock);
  let staging: string | undefined;
  try {
    if (existsSync(target)) {
      for (const file of ['compose.yaml', 'public/catalog.json', 'public/trust.json']) await readFile(path.join(target, file));
      const installed = JSON.parse(await readFile(path.join(target, 'manifest.json'), 'utf8'));
      if (installed.version !== 1 || JSON.stringify(installed.installations) !== JSON.stringify(manifest.instances.map(i => i.installationId))) throw new Error('Module provisioning identity mismatch');
      privateDirectory(target);
      return false;
    }
    staging = await mkdtemp(path.join(directory, '.modules-staging-'));
    privateDirectory(staging);
    await mkdir(path.join(staging, 'public'));
    const publisherFile = path.join(directory, 'security', 'module-publisher-key.pem');
    if (!existsSync(publisherFile)) {
      const pair = generateKeyPairSync('ed25519');
      await writeFile(publisherFile, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
    }
    const publicKey = createPublicKey(await readFile(publisherFile)).export({ type: 'spki', format: 'pem' }).toString();
    await writeFile(path.join(staging, 'public', 'trust.json'), JSON.stringify({ publishers: [{ publisherId: 'local-operator', publicKey }] }, null, 2) + '\n');
    await writeFile(path.join(staging, 'public', 'catalog.json'), JSON.stringify({ catalogVersion: 1, packages: [] }, null, 2) + '\n');
    const services: string[] = []; const networks: string[] = []; const volumes: string[] = [];
    let workerBuild = false;
    for (const i of manifest.instances) {
      const owns = i.role === 'master' || !workerBuild;
      if (i.role === 'worker') workerBuild = true;
      const build = (kind: string) => owns ? `\n    build:\n      context: ${q(sourceRoot)}\n      dockerfile: infra/Dockerfile.${kind}\n      args: { APP: ${i.role} }` : '';
      const originalNginx = await readFile(path.join(directory, 'security', i.key, 'nginx.conf'), 'utf8');
      await mkdir(path.join(staging, i.key));
      await writeFile(path.join(staging, i.key, 'nginx.conf'), originalNginx.replace('location /api/v2/', 'location /api/v3/ { proxy_read_timeout 90s; proxy_pass $secure_backend; }\n  location /api/v2/'));
      services.push(`  ${i.key}-api:
    image: steward-${i.role}-api:0.3.0${build('api')}${i.role === 'worker' ? `
    environment:
      STEWARD_MODULES_FILE: /etc/steward/module-runtime.json
    volumes:
      - type: bind
        source: ${q(path.join(target, i.key, 'core.json'))}
        target: /etc/steward/module-runtime.json
        read_only: true
      - type: bind
        source: ${q(path.join(target, 'public'))}
        target: /etc/steward/module-catalog
        read_only: true
      - type: bind
        source: ${q(path.join(directory, 'security', 'ca-cert.pem'))}
        target: /etc/steward/module-ca.pem
        read_only: true` : ''}
  ${i.key}-web:
    image: steward-${i.role}-web:0.3.0${build('web')}
    volumes:
      - type: bind
        source: ${q(path.join(target, i.key, 'nginx.conf'))}
        target: /etc/nginx/conf.d/security.conf
        read_only: true`);
      if (i.role !== 'worker') continue;
      const catalogFile = '/etc/steward/module-catalog/catalog.json'; const trustFile = '/etc/steward/module-catalog/trust.json';
      const network = `${manifest.project}_${i.key}-modules`;
      const volume = `${manifest.project}_${i.key}-module-state`;
      const workerPublicKey = createPublicKey(await readFile(path.join(directory, 'security', i.key, 'identity-key.pem'))).export({ type: 'spki', format: 'pem' }).toString();
      await writeFile(path.join(staging, i.key, 'core.json'), JSON.stringify({ catalogFile, trustFile, brokerUrl: `https://${i.key}-module-host:8443`, caFile: '/etc/steward/module-ca.pem', tlsServerName: i.key + '-api' }, null, 2));
      await writeFile(path.join(staging, i.key, 'host.json'), JSON.stringify({ installationId: i.installationId, workerPublicKey, catalogFile, trustFile,
        project: manifest.project, workerKey: i.key, databaseHost: i.key + '-db', databasePasswordFile: '/run/secrets/admin_password',
        databaseNetwork: `${manifest.project}_${i.key}-data`, moduleNetwork: network, stateVolume: volume }, null, 2));
      networks.push(`  ${i.key}-modules:\n    name: ${network}\n    internal: true`);
      volumes.push(`  ${i.key}-module-state:\n    name: ${volume}`);
      services.push(`  ${i.key}-module-host:
    image: steward-module-host:0.3.0${!services.some(s => s.includes('dockerfile: infra/Dockerfile.module-host')) ? `
    build:
      context: ${q(sourceRoot)}
      dockerfile: infra/Dockerfile.module-host` : ''}
    pull_policy: never
    restart: unless-stopped
    read_only: true
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    environment:
      MODULE_HOST_CONFIG: /etc/steward/module-host.json
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ${i.key}-module-state:/var/lib/steward/modules
      - type: bind
        source: ${q(path.join(target, i.key, 'host.json'))}
        target: /etc/steward/module-host.json
        read_only: true
      - type: bind
        source: ${q(path.join(target, 'public'))}
        target: /etc/steward/module-catalog
        read_only: true
    secrets:
      - { source: ${i.key}-admin-password, target: admin_password }
      - { source: ${i.key}-tls-key, target: tls_key }
      - { source: ${i.key}-tls-cert, target: tls_cert }
      - { source: security-ca, target: trust_ca }
    networks: [${i.key}, ${i.key}-data, ${i.key}-modules]
    depends_on:
      ${i.key}-db: { condition: service_healthy }`);
    }
    await writeFile(path.join(staging, 'compose.yaml'), `# Phase 3 generic module provider; no module application is included.\nservices:\n${services.join('\n')}\nnetworks:\n${networks.join('\n')}\nvolumes:\n${volumes.join('\n')}\n`);
    await writeFile(path.join(staging, 'manifest.json'), JSON.stringify({ version: 1, installations: manifest.instances.map(i => i.installationId) }, null, 2));
    await rename(staging, target); staging = undefined;
    return true;
  } finally { if (staging) await rm(staging, { recursive: true, force: true }); await rmdir(lock); }
}
